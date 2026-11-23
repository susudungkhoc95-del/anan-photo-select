import { randomUUID } from "node:crypto";
import { extractFolderId, getGoogleApi, scanFolder } from "@/lib/google";
import {
  APP_RECORDS_TABLE, getSupabaseServer, readAppRecord, readAppRecords
} from "@/lib/supabase";
import {
  hasReviewFeedback, REVIEW_NOTE_LIMIT, REVIEW_REGION_LIMIT,
  type ReviewAlbum, type ReviewFeedback, type ReviewRound, type ReviewRoundSummary
} from "@/lib/photo-review-types";
import type { Photo } from "@/lib/types";

const ALBUMS = "_photo_review_albums";
const ROUNDS = "_photo_review_rounds";
const ROOT_LABEL = "Thư mục gốc";
const PAGE_SIZE = 80;
const DRIVE_FOLDER = "application/vnd.google-apps.folder";

type StoredRound = ReviewRound & {
  folderUrl: string;
  photos: Photo[];
  exportLease?: string;
  spreadsheetId?: string;
  exportedAt?: string;
  submissionId?: string;
};

type Payload = Record<string, unknown>;

export class ReviewError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function inputText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function object(value: unknown): Payload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReviewError("Dữ liệu góp ý không hợp lệ.");
  }
  return value as Payload;
}

function roundKey(albumId: string, number: number) {
  return `${albumId}:${String(number).padStart(10, "0")}`;
}

function roundQuery(albumId: string) {
  return getSupabaseServer().from(APP_RECORDS_TABLE)
    .select("payload").eq("scope", "studio").eq("collection", ROUNDS).eq("workspace_id", albumId);
}

async function getAlbum(id: unknown) {
  const albumId = inputText(id, 80);
  const album = /^[\w-]{36}$/.test(albumId) && await readAppRecord<ReviewAlbum>(ALBUMS, albumId);
  if (!album) throw new ReviewError("Không tìm thấy album duyệt ảnh.", 404);
  return album;
}

async function getRound(albumId: string, number?: unknown) {
  if (number !== undefined) {
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) {
      throw new ReviewError("Vòng duyệt không hợp lệ.");
    }
    const round = await readAppRecord<StoredRound>(ROUNDS, roundKey(albumId, number));
    if (!round) throw new ReviewError("Không tìm thấy vòng duyệt.", 404);
    return round;
  }
  const { data, error } = await roundQuery(albumId).order("record_id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ReviewError("Không tìm thấy vòng duyệt.", 404);
  return data.payload as StoredRound;
}

function summarize(round: StoredRound): ReviewRoundSummary {
  return {
    number: round.number,
    folderUrl: round.folderUrl,
    photoCount: round.photoCount,
    feedbackCount: round.feedbackCount,
    outcome: round.outcome,
    submittedAt: round.submittedAt,
    sheetUrl: round.exportedAt && round.spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${round.spreadsheetId}/edit`
      : undefined
  };
}

function publicRound(round: StoredRound, admin = false): ReviewRound {
  const { folderUrl, ...summary } = summarize(round);
  return {
    ...summary, sheetUrl: admin ? summary.sheetUrl : undefined,
    folders: round.folders, revision: round.revision, feedback: admin && !round.submittedAt ? {} : round.feedback
  };
}

async function scanRound(number: number, source: unknown) {
  const folderId = extractFolderId(inputText(source, 2000));
  if (!folderId) throw new ReviewError("Hãy nhập link thư mục Google Drive.");
  const { drive } = getGoogleApi();
  const folder = await drive.files.get({ fileId: folderId, fields: "name,mimeType", supportsAllDrives: true });
  if (folder.data.mimeType !== DRIVE_FOLDER) throw new ReviewError("Link Drive phải trỏ tới một thư mục.");

  const photos: Photo[] = [];
  const folders = new Set<string>();
  await scanFolder(folderId, "", photos, true, "", folders);
  if (!photos.length) throw new ReviewError("Thư mục Drive chưa có ảnh.");
  photos.sort((a, b) => a.folder.localeCompare(b.folder, "vi") || a.name.localeCompare(b.name, "vi", { numeric: true }));
  const counts = new Map(Array.from(folders, (name) => [name, 0]));
  for (const photo of photos) counts.set(photo.folder, (counts.get(photo.folder) || 0) + 1);

  const round: StoredRound = {
    number,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    photos,
    folders: [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "vi"))
      .map(([name, count]) => ({ name, count })),
    photoCount: photos.length,
    revision: randomUUID(),
    feedback: {},
    feedbackCount: 0,
    outcome: null,
    submittedAt: null
  };
  return { round, title: folder.data.name || "Album duyệt ảnh" };
}

function roundRow(albumId: string, round: StoredRound) {
  return { scope: "studio", collection: ROUNDS, record_id: roundKey(albumId, round.number),
    workspace_id: albumId, payload: round };
}

async function insertRound(albumId: string, round: StoredRound) {
  const { error } = await getSupabaseServer().from(APP_RECORDS_TABLE).insert(roundRow(albumId, round));
  if (error?.code === "23505") throw new ReviewError("Vòng này đã được mở. Hãy tải lại album.", 409);
  if (error) throw new Error(error.message);
}

async function updateRound(albumId: string, round: StoredRound, next: StoredRound) {
  const { data, error } = await getSupabaseServer().from(APP_RECORDS_TABLE).update({ payload: next })
    .eq("scope", "studio").eq("collection", ROUNDS).eq("record_id", roundKey(albumId, round.number))
    .eq("payload->>revision", round.revision).select("record_id");
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

export async function createReviewAlbum(payload: Payload) {
  const { round, title } = await scanRound(1, payload.folderUrl);
  const album: ReviewAlbum = {
    id: randomUUID(), title: inputText(payload.title, 150) || title, createdAt: new Date().toISOString()
  };
  const { error } = await getSupabaseServer().from(APP_RECORDS_TABLE).insert([
    { scope: "studio", collection: ALBUMS, record_id: album.id, workspace_id: "", payload: album },
    roundRow(album.id, round)
  ]);
  if (error) throw new Error(error.message);
  return album;
}

export async function listReviewAlbums() {
  const records = await readAppRecords(ALBUMS, undefined, { ascending: false });
  return records.map(({ payload }) => payload as ReviewAlbum);
}

export async function getReviewAdmin(payload: Payload) {
  const album = await getAlbum(payload.albumId);
  // Read only the fields used by the round selector, keeping photos and notes out of the list.
  const rounds: ReviewRoundSummary[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await getSupabaseServer().from(APP_RECORDS_TABLE)
      .select("number:payload->number,folderUrl:payload->>folderUrl,photoCount:payload->photoCount,feedbackCount:payload->feedbackCount,submittedAt:payload->>submittedAt,outcome:payload->>outcome")
      .eq("scope", "studio").eq("collection", ROUNDS).eq("workspace_id", album.id)
      .order("record_id", { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    rounds.push(...(data as unknown as ReviewRoundSummary[]));
    if (data.length < pageSize) break;
  }
  if (!rounds.length) throw new ReviewError("Không tìm thấy vòng duyệt.", 404);
  const round = await getRound(album.id, payload.round ?? rounds[0].number);
  return { album, rounds, round: publicRound(round, true) };
}

export async function openReviewRound(payload: Payload) {
  const album = await getAlbum(payload.albumId);
  const previous = await getRound(album.id);
  if (previous.number !== payload.round || !previous.submittedAt) {
    throw new ReviewError("Hãy tải lại album và chờ phản hồi của vòng hiện tại trước khi mở vòng mới.", 409);
  }
  const { round } = await scanRound(previous.number + 1, inputText(payload.folderUrl, 2000) || previous.folderUrl);
  await insertRound(album.id, round);
  return { number: round.number };
}

export async function getReviewClient(payload: Payload) {
  const album = await getAlbum(payload.albumId);
  return { album, round: publicRound(await getRound(album.id)) };
}

export async function reviewPhotoPage(payload: Payload, admin: boolean) {
  const album = await getAlbum(payload.albumId);
  const round = await getRound(album.id, admin ? payload.round : undefined);
  if (round.number !== payload.round) throw new ReviewError("Studio đã mở vòng mới. Hãy tải lại trang.", 409);
  const folder = typeof payload.folder === "string" ? payload.folder : null;
  const photos = round.photos.filter((photo) =>
    (folder === null || folder === photo.folder) && (!payload.feedbackOnly || hasReviewFeedback(round.feedback[photo.id]))
  );
  const offset = typeof payload.offset === "number" && Number.isSafeInteger(payload.offset) ? Math.max(0, payload.offset) : 0;
  return { photos: photos.slice(offset, offset + PAGE_SIZE), total: photos.length };
}

export async function assertReviewPhoto(albumId: string, roundNumber: number, photoId: string, admin: boolean) {
  if (!/^[\w-]{36}$/.test(albumId)) throw new ReviewError("Không tìm thấy album.", 404);
  const round = await getRound(albumId, admin ? roundNumber : undefined);
  if (round.number !== roundNumber || !round.photos.some((photo) => photo.id === photoId)) {
    throw new ReviewError("Không tìm thấy ảnh trong vòng duyệt.", 404);
  }
}

function normalizeFeedback(value: unknown, photos: Photo[], submitting: boolean): ReviewFeedback {
  const validPhotos = new Set(photos.map((photo) => photo.id));
  const feedback: ReviewFeedback = {};
  for (const [id, raw] of Object.entries(object(value))) {
    if (!validPhotos.has(id)) throw new ReviewError("Ảnh góp ý không thuộc vòng duyệt này.");
    const item = object(raw);
    if (!Array.isArray(item.regions) || item.regions.length > REVIEW_REGION_LIMIT) {
      throw new ReviewError(`Mỗi ảnh có tối đa ${REVIEW_REGION_LIMIT} vùng khoanh.`);
    }
    const numbers = new Set<number>();
    const regions = item.regions.map((entry: unknown) => {
      const { x, y, width, height, number, note } = object(entry);
      if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1 || numbers.has(number) ||
          typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number" ||
          ![x, y, width, height].every(Number.isFinite) ||
          x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) {
        throw new ReviewError("Vị trí hoặc số vùng khoanh không hợp lệ.");
      }
      numbers.add(number);
      const message = inputText(note, REVIEW_NOTE_LIMIT);
      if (submitting && !message) throw new ReviewError("Hãy điền ghi chú cho tất cả vùng đã khoanh.");
      return { x, y, width, height, number, note: message };
    });
    const entry = { note: inputText(item.note, REVIEW_NOTE_LIMIT), regions };
    if (hasReviewFeedback(entry)) feedback[id] = entry;
  }
  return feedback;
}

export async function saveReviewFeedback(payload: Payload, submitting: boolean) {
  const album = await getAlbum(payload.albumId);
  const round = await getRound(album.id);
  const submissionId = submitting ? inputText(payload.submissionId, 80) : "";
  if (round.number !== payload.round) throw new ReviewError("Studio đã mở vòng mới. Hãy tải lại trang.", 409);
  if (submissionId && round.submissionId === submissionId) return publicRound(round);
  if (round.submittedAt || round.revision !== payload.revision) {
    throw new ReviewError("Phản hồi đã thay đổi ở nơi khác. Hãy tải lại trang để xem bản mới nhất.", 409);
  }
  const feedback = normalizeFeedback(payload.feedback, round.photos, submitting);
  const feedbackCount = Object.keys(feedback).length;
  if (submitting && (payload.outcome !== (feedbackCount ? "changes" : "approved") || !submissionId)) {
    throw new ReviewError("Hãy xác nhận lại kết quả duyệt.");
  }
  const next: StoredRound = {
    ...round, feedback, feedbackCount, revision: randomUUID(),
    submittedAt: submitting ? new Date().toISOString() : null,
    outcome: submitting ? (feedbackCount ? "changes" : "approved") : null,
    submissionId: submissionId || undefined
  };
  if (!await updateRound(album.id, round, next)) {
    const latest = await getRound(album.id, round.number);
    if (submissionId && latest.submissionId === submissionId) return publicRound(latest);
    throw new ReviewError("Phản hồi đã thay đổi ở nơi khác. Hãy tải lại trang để xem bản mới nhất.", 409);
  }
  return publicRound(next);
}

export async function exportReviewSheet(payload: Payload) {
  const album = await getAlbum(payload.albumId);
  const round = await getRound(album.id, payload.round);
  if (!round.submittedAt) throw new ReviewError("Khách chưa gửi phản hồi vòng này.");
  const existing = summarize(round).sheetUrl;
  if (existing) return { url: existing };
  if (round.exportLease && Date.parse(round.exportLease) > Date.now()) {
    throw new ReviewError("Google Sheet đang được tạo. Vui lòng thử lại sau.", 409);
  }

  const { sheets } = getGoogleApi();
  const rows = round.photos.flatMap((photo) => {
    const feedback = round.feedback[photo.id];
    if (!feedback) return [];
    return [
      ...(feedback.note ? [[photo.name, photo.folder || ROOT_LABEL, "Cả ảnh", feedback.note]] : []),
      ...feedback.regions.map((region) => [photo.name, photo.folder || ROOT_LABEL, region.number, region.note])
    ];
  });
  if (!rows.length) rows.push(["", "", "", "Khách đã duyệt bộ ảnh."]);
  const values = [["Tên file", "Thư mục", "Vùng", "Ghi chú của khách"], ...rows];

  let claimed = { ...round, revision: randomUUID(), exportLease: new Date(Date.now() + 360_000).toISOString() };
  if (!await updateRound(album.id, round, claimed)) throw new ReviewError("Google Sheet đang được tạo.", 409);
  try {
    if (!claimed.spreadsheetId) {
      const created = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: `Duyệt ảnh sửa - ${album.title} - Vòng ${round.number}` },
          sheets: [{ properties: {
            sheetId: 0, title: "Phản hồi",
            gridProperties: { frozenRowCount: 1, rowCount: Math.max(values.length, 100), columnCount: 4 }
          } }]
        },
        fields: "spreadsheetId"
      });
      const spreadsheetId = created.data.spreadsheetId;
      if (!spreadsheetId) throw new Error("Không tạo được Google Sheet.");
      const next = { ...claimed, spreadsheetId, revision: randomUUID() };
      if (!await updateRound(album.id, claimed, next)) throw new ReviewError("Hãy thử xuất Google Sheet lại.", 409);
      claimed = next;
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: claimed.spreadsheetId,
      range: "'Phản hồi'!A1",
      valueInputOption: "RAW",
      requestBody: { values }
    });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: claimed.spreadsheetId,
      requestBody: { requests: [
        { repeatCell: {
          range: { sheetId: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat"
        } },
        { repeatCell: {
          range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 },
          cell: { userEnteredFormat: { wrapStrategy: "WRAP" } }, fields: "userEnteredFormat.wrapStrategy"
        } },
        ...[210, 190, 90, 500].map((pixelSize, index) => ({ updateDimensionProperties: {
          range: { sheetId: 0, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
          properties: { pixelSize }, fields: "pixelSize"
        } }))
      ] }
    });
    const exported = { ...claimed, exportedAt: new Date().toISOString(), revision: randomUUID(), exportLease: undefined };
    if (!await updateRound(album.id, claimed, exported)) throw new ReviewError("Hãy thử xuất Google Sheet lại.", 409);
    return { url: summarize(exported).sheetUrl };
  } catch (error) {
    await updateRound(album.id, claimed, { ...claimed, revision: randomUUID(), exportLease: undefined }).catch(console.error);
    throw error;
  }
}
