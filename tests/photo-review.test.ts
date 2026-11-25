import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readRecord: vi.fn(),
  requests: [] as Array<{ data?: unknown; error?: unknown }>,
  writes: [] as unknown[],
  rpc: vi.fn(),
  createSheet: vi.fn(),
  sheetValues: vi.fn(),
  sheetLayout: vi.fn()
}));

vi.mock("@/lib/google", () => ({
  extractFolderId: (url: string) => url.split("/").at(-1),
  scanFolder: async (_id: string, _path: string, photos: unknown[], _imageOnly: boolean,
    _exclude: string, folders: Set<string>) => {
    ["ANH DE BAN", "ANH PHONG", "ANH SUA"].forEach((folder) => folders.add(folder));
    photos.push({ id: "photo1", name: "ANAN-01.jpg", folder: "ANH SUA" });
  },
  getGoogleApi: () => ({
    drive: { files: { get: async () => ({ data: { name: "ANAN", mimeType: "application/vnd.google-apps.folder" } }) } },
    sheets: { spreadsheets: {
      create: mocks.createSheet, values: { update: mocks.sheetValues }, batchUpdate: mocks.sheetLayout
    } }
  })
}));
vi.mock("@/lib/supabase", () => ({
  APP_RECORDS_TABLE: "app_records",
  readAppRecord: mocks.readRecord,
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
  mocks.createSheet.mockResolvedValue({ data: { spreadsheetId: "sheet-1" } });
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

  it("deletes against the confirmed round and reports when that round is no longer eligible", async () => {
    await expect(deleteReviewAlbum({ albumId })).rejects.toMatchObject({ status: 400 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: false }).mockResolvedValueOnce({ data: true });
    await expect(deleteReviewAlbum({ albumId, round: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(deleteReviewAlbum({ albumId, round: 2 })).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenLastCalledWith("delete_submitted_review_album", {
      p_album_id: albumId, p_round_id: `${albumId}:0000000002`
    });
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
