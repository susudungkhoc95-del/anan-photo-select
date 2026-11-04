import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ records: vi.fn(), metadata: vi.fn(), values: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ readAppRecords: mocks.records, saveAppRecord: vi.fn(), removeAppRecord: vi.fn() }));
vi.mock("@/lib/google", () => ({
  getWorkflowWorkspaceId: (scope: string) => `workspace-${scope}`,
  getGoogleApi: () => ({ sheets: { spreadsheets: { get: mocks.metadata, values: { get: mocks.values } } } }),
  quoteSheet: (title: string) => `'${title}'`,
  albumSpreadsheetUrl: vi.fn(), archiveAlbum: vi.fn(), listAlbums: vi.fn()
}));
vi.mock("@/lib/telegram", () => ({ sendWorkflowAgeTelegram: vi.fn(), sendWorkflowMoveTelegram: vi.fn(), sendWorkflowReturnDateTelegram: vi.fn() }));
import { getClassifierSheet } from "@/lib/workflow";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.mockImplementation(async (collection: string) => collection === "WorkflowCards"
    ? [{ payload: ["card", "workspace-dp", "list", "Album", "", "0", "dp_select"] }]
    : [{ payload: ["link", "workspace-dp", "card", "Sheet ảnh chọn", "https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=42", "0"] }]);
  mocks.metadata.mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 42, title: "Chọn ảnh" } }] } });
  mocks.values.mockResolvedValue({ data: { values: [["STT", "TÊN FILE", "AP", "ĐB"], [1, "one", "x", "x"], [2, "two", "", "x"], [3, "three"]] } });
});

describe("Đọc Sheet phân loại", () => {
  it("reads only the requested card and links and preserves group priority", async () => {
    expect(await getClassifierSheet({ cardId: "card", scope: "dp" })).toEqual([{ name: "one", group: "ANH PHONG" }, { name: "two", group: "ANH DE BAN" }, { name: "three", group: "ANH SUA" }]);
    expect(mocks.records).toHaveBeenCalledTimes(2);
    expect(mocks.records).toHaveBeenCalledWith("WorkflowCards", "workspace-dp", { payloadIndex: 0, payloadEquals: "card" });
    expect(mocks.records).toHaveBeenCalledWith("WorkflowLinks", "workspace-dp", { payloadIndex: 2, payloadEquals: "card" });
  });
  it("rejects manual cards before accessing the sheet", async () => {
    mocks.records.mockImplementation(async (collection: string) => collection === "WorkflowCards" ? [{ payload: ["card", "workspace-dp", "list", "", "", "0", "manual"] }] : []);
    await expect(getClassifierSheet({ cardId: "card" })).rejects.toThrow("Không tìm thấy thẻ DP Select");
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
});
