import { google, sheets_v4, drive_v3 } from "googleapis";
import { createHash, randomUUID } from "crypto";
import type { Album, Draft, GuideTemplate, Photo, QuickLink, Selection, StudioSettings } from "@/lib/types";
import { DEFAULT_GUIDE, DEFAULT_STUDIO_NAME } from "@/lib/types";
import { sendSelectionEmail } from "@/lib/email";
import { readAppRecords, removeAppRecord, saveAppRecord } from "@/lib/supabase";

const ALBUMS = "_albums";
const DRAFTS = "_drafts";
const SELECTIONS = "_selections";
const SETTINGS = "_settings";
const HEADER_BG = { red: 0.918, green: 0.851, blue: 0.722 };

export class AlbumNotFoundError extends Error {}

let clients:
  | { sheets: sheets_v4.Sheets; drive: drive_v3.Drive; spreadsheetId: string }
  | undefined;

function authClient() {
  if (
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  ) {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return auth;
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets"
      ]
    });
  }
  throw new Error("Chưa cấu hình tài khoản Google cho server.");
}

export function getGoogleApi() {
  if (clients) return clients;
  const spreadsheetId = process.env.GOOGLE_DATA_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("Thiếu GOOGLE_DATA_SPREADSHEET_ID.");
  const auth = authClient();
  clients = {
    sheets: google.sheets({ version: "v4", auth }),
    drive: google.drive({ version: "v3", auth }),
    spreadsheetId
  };
  return clients;
}

export function quoteSheet(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

/** Stable server-owned scope for this deployment's studio. Never supplied by the browser. */
export function getWorkflowWorkspaceId() {
  return `studio_${createHash("sha256").update(getGoogleApi().spreadsheetId).digest("hex").slice(0, 20)}`;
}

async function readTable(name: string) {
  const records = await readAppRecords(name);
  return records.map((record) => [record.record_id, JSON.stringify(record.payload)]);
}

async function upsertJson(name: string, id: string, value: unknown) {
  await saveAppRecord(name, id, value);
}

async function readJson<T>(name: string, id: string): Promise<T | null> {
  const records = await readAppRecords(name);
  return (records.find((record) => record.record_id === id)?.payload as T | undefined) || null;
}

async function deleteJson(name: string, id: string) {
  await removeAppRecord(name, id);
}

export function extractFolderId(input: string) {
  const text = String(input || "").trim();
  return (
    text.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ||
    text.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ||
    text.match(/^([a-zA-Z0-9_-]{20,})$/)?.[1] ||
    ""
  );
}

function clean(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function webUrl(value: unknown, label: string) {
  const url = clean(value, 2000);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch { throw new Error(`${label} phải bắt đầu bằng http:// hoặc https://.`); }
}

export function normalizeSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesAlbumSearch(title: string, query: unknown) {
  const keywords = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!keywords.length) return true;
  const normalizedTitle = normalizeSearchText(title);
  return keywords.every((keyword) => normalizedTitle.includes(keyword));
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function albumUrl(album: Pick<Album, "id" | "title">) {
  const readableTitle = normalizeSearchText(album.title).replace(/\s+/g, "-").slice(0, 70) || "album";
  return `${appUrl()}/a/${readableTitle}--${encodeURIComponent(album.id)}`;
}

function photoSheetName(id: string) {
  return `photos_${id}`.slice(0, 100);
}

async function createSheet(title: string, hidden = true) {
  const { sheets, spreadsheetId } = getGoogleApi();
  const result = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title, hidden } } }] }
  });
  const sheetId = result.data.replies?.[0].addSheet?.properties?.sheetId;
  if (sheetId === null || sheetId === undefined) throw new Error("Không tạo được trang tính dữ liệu.");
  return sheetId;
}

async function scanFolder(
  folderId: string,
  path: string,
  output: Photo[],
  imageOnly = true,
  excludeFolderId = ""
) {
  const { drive } = getGoogleApi();
  let pageToken: string | undefined;
  do {
    const result = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,imageMediaMetadata(width,height))",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    for (const file of result.data.files || []) {
      if (!file.id || file.id === excludeFolderId) continue;
      if (file.mimeType === "application/vnd.google-apps.folder") {
        await scanFolder(file.id, `${path} / ${file.name || "Thư mục"}`, output, imageOnly, excludeFolderId);
      } else if (!imageOnly || String(file.mimeType || "").startsWith("image/")) {
        output.push({
          id: file.id,
          name: file.name || file.id,
          folder: path,
          width: Number(file.imageMediaMetadata?.width || 0) || undefined,
          height: Number(file.imageMediaMetadata?.height || 0) || undefined
        });
      }
    }
    pageToken = result.data.nextPageToken || undefined;
  } while (pageToken);
}

async function writePhotos(album: Album, photos: Photo[]) {
  const { sheets, spreadsheetId } = getGoogleApi();
  await createSheet(album.photoSheet, true);
  const values = [["ID", "TÊN FILE", "THƯ MỤC", "WIDTH", "HEIGHT"], ...photos.map((p) => [p.id, p.name, p.folder, p.width || "", p.height || ""])];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheet(album.photoSheet)}!A1:E${values.length}`,
    valueInputOption: "RAW",
    requestBody: { values }
  });
}

export async function createAlbum(payload: Record<string, unknown>) {
  const folderUrl = clean(payload.folderUrl, 1000);
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error("Không đọc được ID thư mục Drive.");
  const rawFolderUrl = clean(payload.rawFolderUrl, 1000);
  const customerChatUrl = webUrl(payload.customerChatUrl, "Link nhóm chat khách");
  const rawFolderId = rawFolderUrl ? extractFolderId(rawFolderUrl) : "";
  if (rawFolderUrl && !rawFolderId) throw new Error("Không đọc được ID thư mục RAW.");
  const { drive } = getGoogleApi();
  const root = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType",
    supportsAllDrives: true
  });
  if (root.data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("Link ảnh không phải là thư mục Google Drive.");
  }
  if (rawFolderId) {
    await drive.files.get({ fileId: rawFolderId, fields: "id", supportsAllDrives: true });
  }
  const photos: Photo[] = [];
  await scanFolder(folderId, root.data.name || "Album", photos);
  photos.sort((a, b) => a.folder.localeCompare(b.folder, "vi") || a.name.localeCompare(b.name, "vi"));
  const counts = new Map<string, number>();
  photos.forEach((p) => counts.set(p.folder, (counts.get(p.folder) || 0) + 1));
  const now = new Date().toISOString();
  const id = randomUUID().replace(/-/g, "").slice(0, 8);
  const settings = await getSettings();
  const album: Album = {
    id,
    title: clean(payload.title) || root.data.name || "Album",
    folderId,
    folderUrl,
    rawFolderId,
    rawFolderUrl,
    customerChatUrl,
    maxSelect: Math.max(0, Number(payload.maxSelect || 0)),
    largePrintLimit: Math.max(0, Number(payload.largePrintLimit ?? 2)),
    tablePrintLimit: Math.max(0, Number(payload.tablePrintLimit ?? 10)),
    guide: clean(payload.guide, 5000) || settings.defaultGuide,
    photoCount: photos.length,
    folders: [...counts.entries()].sort().map(([name, count]) => ({ name, count })),
    photoSheet: photoSheetName(id),
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  await writePhotos(album, photos);
  await upsertJson(ALBUMS, id, album);
  return {
    ...album,
    clientUrl: albumUrl(album),
    spreadsheetUrl: album.spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${album.spreadsheetId}/edit`
      : ""
  };
}

export async function loadAlbum(id: string) {
  const album = await readJson<Album>(ALBUMS, clean(id, 80));
  if (!album || album.status === "deleted") throw new AlbumNotFoundError("Không tìm thấy album.");
  return album;
}

function publicAlbum(album: Album) {
  return {
    id: album.id,
    title: album.title,
    maxSelect: album.maxSelect,
    largePrintLimit: album.largePrintLimit,
    tablePrintLimit: album.tablePrintLimit,
    guide: album.guide,
    photoCount: album.photoCount,
    folders: album.folders,
    pageSize: 80,
    studioSettings: { studioName: DEFAULT_STUDIO_NAME },
    clientUrl: albumUrl(album)
  };
}

export async function getAlbum(id: string) {
  return publicAlbum(await loadAlbum(id));
}

export async function listAlbums(payload: Record<string, unknown>) {
  const rows = await readTable(ALBUMS);
  const keyword = clean(payload.keyword);
  const status = payload.status === "archived" ? "archived" : "active";
  const albums = rows
    .map((r) => {
      try { return JSON.parse(String(r[1] || "")) as Album; } catch { return null; }
    })
    .filter((a): a is Album => Boolean(a && a.status === status))
    .filter((a) => matchesAlbumSearch(a.title, keyword))
    .sort((a, b) => {
      const n = a.createdAt.localeCompare(b.createdAt);
      return payload.sortOrder === "oldest" ? n : -n;
    });
  const offset = Math.max(0, Number(payload.offset || 0));
  const limit = Math.min(80, Math.max(1, Number(payload.limit || 30)));
  const items = albums.slice(offset, offset + limit).map((a) => ({
    ...a,
    clientUrl: albumUrl(a),
    spreadsheetUrl: a.spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${a.spreadsheetId}/edit`
      : ""
  }));
  return { items, offset, nextOffset: offset + items.length, total: albums.length, hasMore: offset + items.length < albums.length };
}

export async function photoPage(payload: Record<string, unknown>) {
  const album = await loadAlbum(clean(payload.albumId, 80));
  const { sheets, spreadsheetId } = getGoogleApi();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheet(album.photoSheet)}!A2:E`
  });
  const folder = clean(payload.folder) || "all";
  const all = (result.data.values || []).map((r) => ({
    id: String(r[0]), name: String(r[1] || ""), folder: String(r[2] || ""),
    width: Number(r[3] || 0) || undefined, height: Number(r[4] || 0) || undefined
  }));
  const filtered = folder === "all" ? all : all.filter((p) => p.folder === folder);
  const offset = Math.max(0, Number(payload.offset || 0));
  const limit = Math.min(120, Math.max(1, Number(payload.limit || 80)));
  const items = filtered.slice(offset, offset + limit).map(hydratePhoto);
  return { items, offset, nextOffset: offset + items.length, total: filtered.length, hasMore: offset + items.length < filtered.length };
}

export async function photosByIds(payload: Record<string, unknown>) {
  const album = await loadAlbum(clean(payload.albumId, 80));
  const ids = new Set((Array.isArray(payload.ids) ? payload.ids : []).map((id) => clean(id, 120)));
  if (!ids.size) return [];
  return (await allPhotos(album)).filter((photo) => ids.has(photo.id)).map(hydratePhoto);
}

function hydratePhoto(p: Photo) {
  const id = encodeURIComponent(p.id);
  return {
    ...p,
    thumbUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w600`,
    thumbSrcSet: [400, 600, 900].map((width) => `https://drive.google.com/thumbnail?id=${id}&sz=w${width} ${width}w`).join(", "),
    zoomUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w4000`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
    viewUrl: `https://drive.google.com/file/d/${id}/view`
  };
}

export async function getPhotoThumbnail(albumId: string, photoId: string) {
  const album = await loadAlbum(clean(albumId, 80));
  const id = clean(photoId, 120).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id || !(await allPhotos(album)).some((photo) => photo.id === id)) {
    throw new Error("Không tìm thấy ảnh trong album.");
  }
  const { drive } = getGoogleApi();
  const meta = await drive.files.get({
    fileId: id,
    fields: "thumbnailLink,mimeType",
    supportsAllDrives: true
  });
  const thumbnailUrl = String(meta.data.thumbnailLink || "").replace(/=s\d+$/, "=w900");
  if (thumbnailUrl) {
    const token = await authClient().getAccessToken();
    const response = await fetch(thumbnailUrl, {
      headers: token.token ? { Authorization: `Bearer ${token.token}` } : undefined,
      cache: "force-cache"
    });
    if (response.ok) {
      return {
        body: await response.arrayBuffer(),
        contentType: response.headers.get("content-type") || "image/jpeg"
      };
    }
  }
  const original = await drive.files.get(
    { fileId: id, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return {
    body: original.data as ArrayBuffer,
    contentType: String(meta.data.mimeType || "image/jpeg")
  };
}

async function allPhotos(album: Album) {
  const { sheets, spreadsheetId } = getGoogleApi();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheet(album.photoSheet)}!A2:E`
  });
  return (result.data.values || []).map((r) => ({
    id: String(r[0]), name: String(r[1] || ""), folder: String(r[2] || ""),
    width: Number(r[3] || 0) || undefined, height: Number(r[4] || 0) || undefined
  }));
}

function normalizeIds(values: unknown, valid: Set<string>, limit = 500) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(values) ? values : []) {
    const id = clean(raw, 120).replace(/[^a-zA-Z0-9_-]/g, "");
    if (id && valid.has(id) && !seen.has(id) && result.length < limit) {
      result.push(id); seen.add(id);
    }
  }
  return result;
}

async function normalizeSelection(album: Album, payload: Record<string, unknown>) {
  const photos = await allPhotos(album);
  const valid = new Set(photos.map((p) => p.id));
  const selectedIds = normalizeIds(payload.selectedIds, valid, album.maxSelect || 500);
  const selected = new Set(selectedIds);
  const largePrintIds = normalizeIds(payload.largePrintIds, selected, album.largePrintLimit || 500);
  const tablePrintIds = normalizeIds(payload.tablePrintIds, selected, album.tablePrintLimit || 500);
  if (album.maxSelect && selectedIds.length > album.maxSelect) throw new Error(`Chỉ được chọn tối đa ${album.maxSelect} ảnh.`);
  if (album.largePrintLimit && largePrintIds.length > album.largePrintLimit) throw new Error(`Chỉ được chọn tối đa ${album.largePrintLimit} ảnh phóng to.`);
  if (album.tablePrintLimit && tablePrintIds.length > album.tablePrintLimit) throw new Error(`Chỉ được chọn tối đa ${album.tablePrintLimit} ảnh để bàn.`);
  const inputNotes = payload.photoNotes && typeof payload.photoNotes === "object" ? payload.photoNotes as Record<string, unknown> : {};
  const photoNotes: Record<string, string> = {};
  selectedIds.forEach((id) => {
    const note = clean(inputNotes[id], 500);
    if (note) photoNotes[id] = note;
  });
  return { selectedIds, largePrintIds, tablePrintIds, photoNotes, albumNote: clean(payload.albumNote, 2000), photos };
}

export async function saveDraft(payload: Record<string, unknown>) {
  const album = await loadAlbum(clean(payload.albumId, 80));
  const normalized = await normalizeSelection(album, payload);
  const draft: Draft = {
    albumId: album.id,
    sessionId: clean(payload.sessionId, 80),
    selectedIds: normalized.selectedIds,
    largePrintIds: normalized.largePrintIds,
    tablePrintIds: normalized.tablePrintIds,
    photoNotes: normalized.photoNotes,
    albumNote: normalized.albumNote,
    savedAt: new Date().toISOString()
  };
  await upsertJson(DRAFTS, album.id, draft);
  return { ok: true, savedAt: draft.savedAt };
}

export async function getDraft(albumId: string) {
  await loadAlbum(albumId);
  return readJson<Draft>(DRAFTS, albumId);
}

export async function getSelection(albumId: string) {
  const album = await loadAlbum(albumId);
  const selection = await readJson<Selection>(SELECTIONS, albumId);
  if (!selection) return null;
  const byId = new Map((await allPhotos(album)).map((p) => [p.id, p]));
  return { ...selection, selectedFiles: selection.selectedIds.map((id) => byId.get(id)).filter(Boolean).map((p) => hydratePhoto(p!)) };
}

function baseName(name: string) {
  return name.replace(/\.(jpe?g|png|webp|heic|heif|tiff?)$/i, "");
}

function fileKey(name: string) {
  return baseName(name).replace(/\.[^.]+$/g, "").trim().toLowerCase();
}

async function getOrCreateAlbumSpreadsheet(album: Album) {
  const title = safeSheetTitle(album.title);
  const { sheets, drive, spreadsheetId: dataSpreadsheetId } = getGoogleApi();
  if (album.spreadsheetId) {
    const current = await sheets.spreadsheets.get({
      spreadsheetId: album.spreadsheetId,
      fields: "sheets.properties"
    });
    const sheet = current.data.sheets?.[0]?.properties;
    if (sheet?.sheetId == null) throw new Error("File kết quả album không có trang tính.");
    album.resultSheetId = sheet.sheetId;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: album.spreadsheetId,
      requestBody: { requests: [{
        updateSheetProperties: {
          properties: { sheetId: sheet.sheetId, title, hidden: false },
          fields: "title,hidden"
        }
      }] }
    });
    return album.spreadsheetId;
  }

  const oldResultSheetId = album.resultSheetId;
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `${title} - ảnh khách chọn` },
      sheets: [{ properties: { title } }]
    },
    fields: "spreadsheetId,sheets.properties"
  });
  const newSpreadsheetId = created.data.spreadsheetId;
  const newSheetId = created.data.sheets?.[0]?.properties?.sheetId;
  if (!newSpreadsheetId || newSheetId == null) throw new Error("Không tạo được file kết quả album.");
  album.spreadsheetId = newSpreadsheetId;
  album.resultSheetId = newSheetId;

  try {
    const file = await drive.files.get({
      fileId: newSpreadsheetId,
      fields: "parents",
      supportsAllDrives: true
    });
    await drive.files.update({
      fileId: newSpreadsheetId,
      addParents: album.folderId,
      removeParents: (file.data.parents || []).join(",") || undefined,
      fields: "id,parents",
      supportsAllDrives: true
    });
  } catch (error) {
    console.warn("Không thể chuyển file kết quả vào thư mục album:", error);
  }

  if (oldResultSheetId !== undefined) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: dataSpreadsheetId,
        requestBody: { requests: [{ deleteSheet: { sheetId: oldResultSheetId } }] }
      });
    } catch {
      // The obsolete tab may already have been removed manually.
    }
  }
  return newSpreadsheetId;
}

async function writeResultSheet(album: Album, selection: Selection, photos: Photo[]) {
  const title = safeSheetTitle(album.title);
  const resultSpreadsheetId = await getOrCreateAlbumSpreadsheet(album);
  const { sheets } = getGoogleApi();
  const selected = new Map(photos.map((p) => [p.id, p]));
  const large = new Set(selection.largePrintIds);
  const table = new Set(selection.tablePrintIds);
  const missing = new Set((album.rawLastReport?.missing || []).map(fileKey));
  const skipped = new Set((album.rawLastReport?.skippedNames || []).map(fileKey));
  const rows = selection.selectedIds.map((id, index) => {
    const p = selected.get(id)!;
    const key = fileKey(p.name);
    const raw = missing.has(key) ? "KHÔNG NHẶT ĐƯỢC RAW" : skipped.has(key) ? "ĐÃ CÓ / TRÙNG" : "";
    return [index + 1, baseName(p.name), large.has(id) ? "x" : "", table.has(id) ? "x" : "", selection.photoNotes[id] || "", raw];
  });
  const values: (string | number)[][] = [["SỐ THỨ TỰ", "TÊN FILE", "ẢNH PHÓNG TO 60X90", "ẢNH ĐỂ BÀN", "GHI CHÚ ẢNH", "TRẠNG THÁI RAW"], ...rows];
  if (selection.albumNote) values.push([], ["LƯU Ý CHUNG", selection.albumNote]);
  await sheets.spreadsheets.values.clear({ spreadsheetId: resultSpreadsheetId, range: `${quoteSheet(title)}!A:Z` });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: resultSpreadsheetId,
    requestBody: { requests: [{
      unmergeCells: { range: { sheetId: album.resultSheetId, startColumnIndex: 0, endColumnIndex: 6 } }
    }] }
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: resultSpreadsheetId,
    range: `${quoteSheet(title)}!A1:F${values.length}`,
    valueInputOption: "RAW",
    requestBody: { values }
  });
  const requests: sheets_v4.Schema$Request[] = [
    { repeatCell: { range: { sheetId: album.resultSheetId }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, bold: false } } }, fields: "userEnteredFormat" } },
    { repeatCell: { range: { sheetId: album.resultSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 }, cell: { userEnteredFormat: { backgroundColor: HEADER_BG, textFormat: { bold: true }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } }, fields: "userEnteredFormat" } },
    { updateSheetProperties: { properties: { sheetId: album.resultSheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { autoResizeDimensions: { dimensions: { sheetId: album.resultSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 6 } } },
    { autoResizeDimensions: { dimensions: { sheetId: album.resultSheetId, dimension: "ROWS", startIndex: 0, endIndex: values.length } } },
    { repeatCell: { range: { sheetId: album.resultSheetId, startRowIndex: 1, endRowIndex: rows.length + 1, startColumnIndex: 0, endColumnIndex: 4 }, cell: { userEnteredFormat: { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(horizontalAlignment,verticalAlignment)" } },
    { repeatCell: { range: { sheetId: album.resultSheetId, startRowIndex: 1, endRowIndex: rows.length + 1, startColumnIndex: 4, endColumnIndex: 5 }, cell: { userEnteredFormat: { horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy)" } },
    { repeatCell: { range: { sheetId: album.resultSheetId, startRowIndex: 1, endRowIndex: rows.length + 1, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy)" } }
  ];
  if (selection.albumNote) {
    requests.push({ mergeCells: { range: { sheetId: album.resultSheetId, startRowIndex: rows.length + 2, endRowIndex: rows.length + 3, startColumnIndex: 1, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } });
  }
  rows.forEach((row, i) => {
    const r = i + 1;
    if (row[2]) requests.push({ repeatCell: { range: { sheetId: album.resultSheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 3 }, cell: { userEnteredFormat: { backgroundColor: { red: .957, green: .718, blue: .718 } } }, fields: "userEnteredFormat.backgroundColor" } });
    if (row[3]) requests.push({ repeatCell: { range: { sheetId: album.resultSheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 4 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: .878, blue: .541 } } }, fields: "userEnteredFormat.backgroundColor" } });
    if (row[5]) requests.push({ repeatCell: { range: { sheetId: album.resultSheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 6 }, cell: { userEnteredFormat: { backgroundColor: { red: 0, green: 0, blue: 0 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } });
  });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: resultSpreadsheetId, requestBody: { requests } });
  const dimensions = await sheets.spreadsheets.get({
    spreadsheetId: resultSpreadsheetId,
    ranges: [quoteSheet(title)],
    includeGridData: true,
    fields: "sheets(properties(sheetId),data(columnMetadata(pixelSize),rowMetadata(pixelSize)))"
  });
  const grid = dimensions.data.sheets?.find((sheet) => sheet.properties?.sheetId === album.resultSheetId)?.data?.[0];
  const minimumWidths = [110, 170, 210, 150, 300, 180];
  const layoutRequests: sheets_v4.Schema$Request[] = minimumWidths.map((minimum, index) => ({
    updateDimensionProperties: {
      range: { sheetId: album.resultSheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
      properties: { pixelSize: Math.max(minimum, Number(grid?.columnMetadata?.[index]?.pixelSize || 0)) },
      fields: "pixelSize"
    }
  }));
  layoutRequests.push({
    updateDimensionProperties: {
      range: { sheetId: album.resultSheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: Math.max(42, Number(grid?.rowMetadata?.[0]?.pixelSize || 0)) },
      fields: "pixelSize"
    }
  });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: resultSpreadsheetId, requestBody: { requests: layoutRequests } });
}

function safeSheetTitle(title: string) {
  // Sheets tab names cannot contain these characters and are limited to 100 chars.
  return (title || "Album").replace(/[\[\]*\/\\?:]/g, "-").trim().slice(0, 100) || "Album";
}

export async function saveSelection(payload: Record<string, unknown>) {
  const album = await loadAlbum(clean(payload.albumId, 80));
  const normalized = await normalizeSelection(album, payload);
  const previousSelection = await readJson<Selection>(SELECTIONS, album.id);
  const selection: Selection = {
    albumId: album.id,
    sessionId: clean(payload.sessionId, 80),
    selectedIds: normalized.selectedIds,
    largePrintIds: normalized.largePrintIds,
    tablePrintIds: normalized.tablePrintIds,
    photoNotes: normalized.photoNotes,
    albumNote: normalized.albumNote,
    submittedAt: new Date().toISOString()
  };
  await upsertJson(SELECTIONS, album.id, selection);
  await deleteJson(DRAFTS, album.id);
  album.submittedAt = selection.submittedAt;
  album.submittedCount = selection.selectedIds.length;
  album.updatedAt = selection.submittedAt;
  await writeResultSheet(album, selection, normalized.photos);
  await upsertJson(ALBUMS, album.id, album);
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${album.spreadsheetId}/edit`;
  // Workflow is created only after the selection and its result spreadsheet are durable.
  // Dynamic import keeps the core Google module independent from the Workflow repository.
  const { createOrUpdateCardFromSelection } = await import("@/lib/workflow");
  await createOrUpdateCardFromSelection(album, selection, spreadsheetUrl);
  try {
    await sendSelectionEmail({
      album,
      selectedCount: selection.selectedIds.length,
      largePrintCount: selection.largePrintIds.length,
      tablePrintCount: selection.tablePrintIds.length,
      submittedAt: selection.submittedAt,
      isUpdate: Boolean(previousSelection),
      spreadsheetUrl,
      clientUrl: albumUrl(album)
    });
  } catch (error) {
    console.error("Không gửi được email thông báo:", error);
  }
  return {
    ok: true,
    count: selection.selectedIds.length,
    spreadsheetUrl
  };
}

export async function updateRawFolder(payload: Record<string, unknown>) {
  const album = await loadAlbum(clean(payload.albumId, 80));
  const rawFolderUrl = clean(payload.rawFolderUrl, 1000);
  const rawFolderId = rawFolderUrl ? extractFolderId(rawFolderUrl) : "";
  if (rawFolderUrl && !rawFolderId) throw new Error("Không đọc được ID thư mục RAW.");
  if (rawFolderId) await getGoogleApi().drive.files.get({ fileId: rawFolderId, fields: "id", supportsAllDrives: true });
  album.rawFolderUrl = rawFolderUrl;
  album.rawFolderId = rawFolderId;
  album.rawSelectionFolderId = "";
  album.rawSelectionFolderUrl = "";
  album.rawLastReport = null;
  album.updatedAt = new Date().toISOString();
  await upsertJson(ALBUMS, album.id, album);
  return { ok: true };
}

export async function updateCustomerChat(payload: Record<string, unknown>) {
  const album = await loadAlbum(clean(payload.albumId, 80));
  album.customerChatUrl = webUrl(payload.customerChatUrl, "Link nhóm chat khách");
  album.updatedAt = new Date().toISOString();
  await upsertJson(ALBUMS, album.id, album);
  return { ok: true };
}

export async function createRawSelectionFolder(id: string) {
  const album = await loadAlbum(id);
  if (!album.rawFolderId) throw new Error("Album chưa có thư mục RAW.");
  const selection = await readJson<Selection>(SELECTIONS, id);
  if (!selection?.selectedIds.length) throw new Error("Khách chưa gửi danh sách ảnh.");
  const photos = await allPhotos(album);
  const byId = new Map(photos.map((p) => [p.id, p]));
  const { drive } = getGoogleApi();
  const safeName = album.title.replace(/[\/\\:*?"<>|]/g, "-").trim().slice(0, 120) || "Album";
  const found = await drive.files.list({
    q: `'${album.rawFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${safeName.replace(/'/g, "\\'")}' and trashed = false`,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  let targetId = found.data.files?.[0]?.id;
  if (!targetId) {
    const created = await drive.files.create({
      requestBody: { name: safeName, mimeType: "application/vnd.google-apps.folder", parents: [album.rawFolderId] },
      fields: "id",
      supportsAllDrives: true
    });
    targetId = created.data.id || undefined;
  }
  if (!targetId) throw new Error("Không tạo được thư mục RAW chọn.");
  const rawFiles: Photo[] = [];
  await scanFolder(album.rawFolderId, "", rawFiles, false, targetId);
  const rawByKey = new Map(rawFiles.filter((p) => /\.(arw|srf|sr2|cr2|cr3|crw|nef|nrw|dng|rwl)$/i.test(p.name)).map((p) => [fileKey(p.name), p]));
  const existing: Photo[] = [];
  await scanFolder(targetId, "", existing, false);
  const existingNames = new Set(existing.map((p) => p.name));
  const missing: string[] = [], skippedNames: string[] = [];
  let copied = 0, skipped = 0;
  for (const photoId of selection.selectedIds) {
    const photo = byId.get(photoId);
    if (!photo) continue;
    const raw = rawByKey.get(fileKey(photo.name));
    if (!raw) { missing.push(baseName(photo.name)); continue; }
    if (existingNames.has(raw.name)) { skipped++; skippedNames.push(baseName(photo.name)); continue; }
    await drive.files.copy({ fileId: raw.id, requestBody: { name: raw.name, parents: [targetId] }, supportsAllDrives: true });
    existingNames.add(raw.name); copied++;
  }
  album.rawSelectionFolderId = targetId;
  album.rawSelectionFolderUrl = `https://drive.google.com/drive/folders/${targetId}`;
  album.rawLastReport = { copied, skipped, skippedNames, missing, checkedAt: new Date().toISOString() };
  album.updatedAt = new Date().toISOString();
  await writeResultSheet(album, selection, photos);
  await upsertJson(ALBUMS, album.id, album);
  return { ok: true, url: album.rawSelectionFolderUrl, ...album.rawLastReport };
}

export async function deleteAlbum(id: string) {
  const album = await loadAlbum(id);
  album.status = "deleted";
  album.updatedAt = new Date().toISOString();
  await upsertJson(ALBUMS, id, album);
  await deleteJson(DRAFTS, id);
  return { ok: true };
}

export async function archiveAlbum(id: string, restore = false) {
  const album = await loadAlbum(id);
  album.status = restore ? "active" : "archived";
  album.updatedAt = new Date().toISOString();
  await upsertJson(ALBUMS, id, album);
  return { ok: true };
}

export async function getSettings() {
  const saved = await readJson<Partial<StudioSettings>>(SETTINGS, "studio");
  const legacyGuide = clean(saved?.defaultGuide, 5000) || DEFAULT_GUIDE;
  const savedTemplates = Array.isArray(saved?.guideTemplates) ? saved.guideTemplates : [];
  const guideTemplates: GuideTemplate[] = savedTemplates
    .map((template, index) => ({
      id: clean(template?.id, 80) || `template-${index + 1}`,
      name: clean(template?.name, 80) || `Mẫu ${index + 1}`,
      guide: clean(template?.guide, 5000) || legacyGuide
    }))
    .filter((template, index, templates) => templates.findIndex((item) => item.id === template.id) === index)
    .slice(0, 20);
  if (!guideTemplates.length) guideTemplates.push({ id: "default", name: "Mẫu mặc định", guide: legacyGuide });
  const defaultGuideTemplateId = guideTemplates.some((template) => template.id === saved?.defaultGuideTemplateId)
    ? String(saved?.defaultGuideTemplateId)
    : guideTemplates[0].id;
  const defaultGuide = guideTemplates.find((template) => template.id === defaultGuideTemplateId)?.guide || legacyGuide;
  const quickLinks: QuickLink[] = (Array.isArray(saved?.quickLinks) ? saved.quickLinks : [])
    .map((link, index) => {
      const item = link && typeof link === "object" ? link as Record<string, unknown> : {};
      const url = clean(item.url, 2000);
      try { return { id: clean(item.id, 80) || `quick-${index + 1}`, label: clean(item.label, 80) || "Mở thư mục", url: webUrl(url, "Link truy cập nhanh") }; }
      catch { return null; }
    })
    .filter((link): link is QuickLink => Boolean(link))
    .slice(0, 15);
  return { studioName: DEFAULT_STUDIO_NAME, defaultGuide, defaultGuideTemplateId, guideTemplates, quickLinks };
}

export async function saveSettings(payload: Record<string, unknown>) {
  const current = await getSettings();
  const incoming = Array.isArray(payload.guideTemplates) ? payload.guideTemplates : current.guideTemplates;
  const ids = new Set<string>();
  const guideTemplates: GuideTemplate[] = incoming
    .map((template, index) => {
      const item = template && typeof template === "object" ? template as Record<string, unknown> : {};
      const id = clean(item.id, 80) || `template-${index + 1}`;
      return { id, name: clean(item.name, 80) || `Mẫu ${index + 1}`, guide: clean(item.guide, 5000) || DEFAULT_GUIDE };
    })
    .filter((template) => !ids.has(template.id) && Boolean(ids.add(template.id)))
    .slice(0, 20);
  if (!guideTemplates.length) throw new Error("Cần lưu ít nhất một mẫu hướng dẫn.");
  const requestedDefault = clean(payload.defaultGuideTemplateId, 80);
  const defaultGuideTemplateId = guideTemplates.some((template) => template.id === requestedDefault)
    ? requestedDefault
    : guideTemplates[0].id;
  const defaultGuide = guideTemplates.find((template) => template.id === defaultGuideTemplateId)?.guide || DEFAULT_GUIDE;
  const incomingLinks = Array.isArray(payload.quickLinks) ? payload.quickLinks : current.quickLinks;
  const linkIds = new Set<string>();
  const quickLinks: QuickLink[] = incomingLinks.map((link, index) => {
    const item = link && typeof link === "object" ? link as Record<string, unknown> : {};
    return {
      id: clean(item.id, 80) || `quick-${index + 1}`,
      label: clean(item.label, 80) || "Mở thư mục",
      url: webUrl(item.url, "Link truy cập nhanh")
    };
  }).filter((link) => !linkIds.has(link.id) && Boolean(linkIds.add(link.id))).slice(0, 15);
  const settings: StudioSettings = { studioName: DEFAULT_STUDIO_NAME, defaultGuide, defaultGuideTemplateId, guideTemplates, quickLinks };
  await upsertJson(SETTINGS, "studio", settings);
  return settings;
}
