import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const mocks = vi.hoisted(() => ({
  readRecord: vi.fn(),
  isAdmin: vi.fn(),
  download: vi.fn(),
  afterResponse: vi.fn<(task: () => Promise<void>) => void>(),
  requests: [] as Array<{ data?: unknown; error?: unknown }>,
  writes: [] as unknown[],
  rpc: vi.fn(),
  createSheet: vi.fn(),
  sheetValues: vi.fn(),
  sheetLayout: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(), after: mocks.afterResponse
}));
vi.mock("@/lib/google", () => ({
  extractFolderId: (url: string) => url.split("/").at(-1),
  scanFolder: async (_id: string, _path: string, photos: unknown[], _imageOnly: boolean,
    _exclude: string, folders: Set<string>) => {
    ["ANH DE BAN", "ANH PHONG", "ANH SUA"].forEach((folder) => folders.add(folder));
    photos.push({ id: "photo1", name: "ANAN-01.jpg", folder: "ANH SUA" });
  },
  getGoogleApi: () => ({
    drive: { files: { get: (...args: unknown[]) => args.length > 1
      ? mocks.download(...args) : Promise.resolve({ data: { name: "ANAN", mimeType: "application/vnd.google-apps.folder" } }) } },
    sheets: { spreadsheets: {
      create: mocks.createSheet, values: { update: mocks.sheetValues }, batchUpdate: mocks.sheetLayout
    } }
  })
}));
vi.mock("@/lib/supabase", () => ({
  APP_RECORDS_TABLE: "app_records",
  readAppRecord: mocks.readRecord,
  readAppRecords: async () => [],
  getSupabaseServer: () => ({ rpc: mocks.rpc, from: () => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit", "maybeSingle"]) query[method] = () => query;
    for (const method of ["insert", "update"]) query[method] = (value: unknown) => {
      mocks.writes.push(value);
      return query;
    };
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(mocks.requests.shift()).then(resolve, reject);
    return query;
  } })
}));

import { deleteReviewAlbum, exportReviewSheet, getReviewClient, openReviewRound, saveReviewFeedback } from "@/lib/photo-review";
import { POST } from "@/app/api/review/route";
import { GET as downloadPhoto } from "@/app/api/review/download/route";

const albumId = "00000000-0000-0000-0000-000000000001";
const album = { id: albumId, title: "Album khách", createdAt: "2026-01-01" };
const photo = { id: "photo1", name: "ANAN-01.jpg", folder: "ANH SUA" };
const current = {
  number: 1, folderUrl: "https://drive.google.com/drive/folders/folder1", photos: [photo],
  folders: [{ name: "ANH SUA", count: 1 }], photoCount: 1, revision: "current",
  feedback: {}, feedbackCount: 0, outcome: null, submittedAt: null
};
const region = { x: .1, y: .2, width: .3, height: .4, number: 2, note: "Chỉnh sáng" };
const feedback = { photo1: { note: "Giảm tông vàng", regions: [region] } };
const submitted = { ...current, feedback, feedbackCount: 1, outcome: "changes", submittedAt: "2026-01-02" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requests = [];
  mocks.writes = [];
  mocks.readRecord.mockImplementation((collection: string) => collection.endsWith("_albums") ? album : submitted);
  mocks.isAdmin.mockResolvedValue(false);
  mocks.createSheet.mockResolvedValue({ data: { spreadsheetId: "sheet-1" } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("photo review notifications", () => {
  const payload = { albumId, round: 1, revision: "current", submissionId: "submit-1", outcome: "changes", feedback };

  function request(action: "submit" | "draft", body: Record<string, unknown> = payload) {
    return POST(new Request("http://localhost/api/review", { method: "POST", body: JSON.stringify({ action, payload: body }) }));
  }

  it("schedules a Telegram message once after a successful edit submission", async () => {
    const titledAlbum = { ...album, title: "An & <Bình>" };
    mocks.readRecord.mockResolvedValue(titledAlbum);
    mocks.requests.push({ data: { payload: current } }, { data: [{ record_id: "round-1" }] });
    const response = await request("submit");
    expect(response.status).toBe(200);
    expect(mocks.afterResponse).toHaveBeenCalledOnce();
    const { payload: saved } = mocks.writes[0] as { payload: typeof submitted };
    mocks.requests.push({ data: { payload: saved } });
    expect((await request("submit")).status).toBe(200);
    expect(mocks.afterResponse).toHaveBeenCalledOnce();

    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "123");
    vi.stubEnv("TELEGRAM_CHAT_IDS", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://studio.example");
    const fetchMessage = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMessage);
    await mocks.afterResponse.mock.calls[0][0]();
    expect(fetchMessage).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchMessage.mock.calls[0][1]?.body))).toEqual(expect.objectContaining({
      chat_id: "123", parse_mode: "HTML",
      text: "📸 <b>DP Review · Khách đã gửi chỉnh sửa</b>\n\n<b>Album</b> An &amp; &lt;Bình&gt;\n<b>Vòng duyệt</b> 1\n<b>Ảnh cần sửa</b> 1 ảnh",
      reply_markup: { inline_keyboard: [[{
        text: "🔗 Mở album trong DP Review", url: `https://studio.example/review?album=${albumId}&round=1`
      }]] }
    }));
  });

  it("does not notify for drafts, approvals, or rejected submissions", async () => {
    mocks.requests.push(
      { data: { payload: current } }, { data: [{ record_id: "round-1" }] },
      { data: { payload: current } }, { data: [{ record_id: "round-1" }] },
      { data: { payload: current } }
    );
    expect((await request("draft")).status).toBe(200);
    expect((await request("submit", { ...payload, outcome: "approved", feedback: {} })).status).toBe(200);
    expect((await request("submit", { ...payload, revision: "stale" })).status).toBe(409);
    expect(mocks.afterResponse).not.toHaveBeenCalled();
  });
});

describe("photo review downloads", () => {
  function request(action: string, payload: Record<string, unknown>) {
    return POST(new Request("http://localhost/api/review", { method: "POST", body: JSON.stringify({ action, payload }) }));
  }

  function download(round = 1, photoId = photo.id) {
    const query = new URLSearchParams({ albumId, round: String(round), photoId });
    return downloadPhoto(new Request(`http://localhost/api/review/download?${query}`));
  }

  it("defaults older albums to off and only lets the admin change the setting", async () => {
    const status = await request("downloadStatus", { albumId });
    expect(await status.json()).toEqual({ data: { enabled: false } });
    expect((await request("setDownload", { albumId, enabled: true })).status).toBe(401);
    expect(mocks.writes).toHaveLength(0);

    mocks.isAdmin.mockResolvedValue(true);
    mocks.requests.push({ data: [{ record_id: albumId }] }, { data: [{ record_id: albumId }] });
    expect(await (await request("setDownload", { albumId, enabled: true })).json()).toEqual({ data: { enabled: true } });
    expect(await (await request("setDownload", { albumId, enabled: false })).json()).toEqual({ data: { enabled: false } });
    expect(mocks.writes).toEqual([
      { payload: { ...album, downloadEnabled: true } },
      { payload: { ...album, downloadEnabled: false } }
    ]);
  });

  it("checks the setting, current round and photo before fetching the original from Drive", async () => {
    expect((await download()).status).toBe(403);
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.readRecord.mockResolvedValue({ ...album, downloadEnabled: true });
    mocks.requests.push({ data: { payload: submitted } }, { data: { payload: submitted } });
    expect((await download(2)).status).toBe(404);
    expect((await download(1, "not-in-this-album")).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();

    const name = 'Ảnh cưới "01".jpg';
    mocks.requests.push({ data: { payload: { ...submitted, photos: [{ ...photo, name }] } } });
    const original = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    mocks.download.mockResolvedValueOnce({ data: Readable.from([original]) });
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(original);
    expect(mocks.download).toHaveBeenCalledWith(
      { fileId: photo.id, alt: "media", supportsAllDrives: true },
      expect.objectContaining({ responseType: "stream" })
    );
  });
});

describe("photo review rounds", () => {
  it("opens a new round with the actual Drive folder names and leaves old feedback in its own row", async () => {
    mocks.requests.push({ data: { payload: submitted } });
    mocks.rpc.mockResolvedValueOnce({ data: true });
    await expect(openReviewRound({ albumId, round: 1 })).resolves.toEqual({ number: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith("insert_next_review_round", {
      p_album_id: albumId,
      p_previous_round_id: `${albumId}:0000000001`,
      p_round_id: `${albumId}:0000000002`,
      p_round: expect.objectContaining({
        feedback: {}, photoCount: 1, submittedAt: null, folders: [
          { name: "ANH DE BAN", count: 0 }, { name: "ANH PHONG", count: 0 }, { name: "ANH SUA", count: 1 }
        ]
      })
    });
    mocks.requests.push({ data: { payload: mocks.rpc.mock.calls[0][1].p_round } });
    const data = await getReviewClient({ albumId });
    expect(data.round.number).toBe(2);
    expect(data.round).not.toHaveProperty("folderUrl");
  });

  it("deletes from the album list using only the album ID", async () => {
    await expect(deleteReviewAlbum({ albumId: "invalid" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null });
    await expect(deleteReviewAlbum({ albumId })).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("delete_review_album", { p_album_id: albumId });
  });

  it("rejects stale edits and requires text for every region before accepting a submission", async () => {
    mocks.requests.push({ data: { payload: current } }, { data: { payload: current } });
    await expect(saveReviewFeedback({ albumId, round: 1, revision: "stale", feedback }, false))
      .rejects.toMatchObject({ status: 409 });
    await expect(saveReviewFeedback({
      albumId, round: 1, revision: "current", submissionId: "send-1", outcome: "changes",
      feedback: { photo1: { note: "", regions: [{ ...region, note: " " }] } }
    }, true)).rejects.toThrow("Hãy điền ghi chú");
    expect(mocks.writes).toHaveLength(0);
  });

  it("keeps region numbers and writes the customer's text as raw Sheet values", async () => {
    const keyed = { ...submitted, feedback: { photo1: { note: "=ghi chú gốc", regions: [region] } } };
    mocks.readRecord.mockImplementation((collection: string) => collection.endsWith("_albums") ? album : keyed);
    mocks.requests.push(...Array.from({ length: 3 }, () => ({ data: ["updated"] })));
    await expect(exportReviewSheet({ albumId, round: 1 })).resolves.toEqual({
      url: "https://docs.google.com/spreadsheets/d/sheet-1/edit"
    });
    expect(mocks.sheetValues).toHaveBeenCalledWith(expect.objectContaining({
      valueInputOption: "RAW", requestBody: { values: [
        ["Tên file", "Thư mục", "Vùng", "Ghi chú của khách"],
        ["ANAN-01.jpg", "ANH SUA", "Cả ảnh", "=ghi chú gốc"],
        ["ANAN-01.jpg", "ANH SUA", 2, "Chỉnh sáng"]
      ] }
    }));
  });
});
