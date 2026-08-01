import { describe, expect, it } from "vitest";
import { workflowAge, workflowCardMatches } from "@/lib/workflow-utils";
import type { WorkflowCard, WorkflowLink, WorkflowList } from "@/lib/types";

const list: WorkflowList = { id: "todo", workspaceId: "studio", name: "CẦN LÀM", position: 0, systemKey: "TODO_INBOX", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
const card: WorkflowCard = { id: "card", workspaceId: "studio", listId: "todo", title: "Hồng Ngọc & Trần Quang", note: "Ưu tiên chỉnh da", position: 0, source: "dp_select", dpSelectAlbumId: "album", dpSelectSubmissionId: "submission", selectionSubmittedAt: "2026-08-01T00:00:00.000Z", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", completedAt: "", createdBy: "dp_select", dpSummary: "" };
const links: WorkflowLink[] = [{ id: "link", workspaceId: "studio", cardId: "card", label: "Sheet ảnh chọn", url: "https://docs.google.com/spreadsheets/d/example", position: 0, createdAt: card.createdAt, updatedAt: card.updatedAt }];

describe("workflow search", () => {
  it("finds title, note and links without accents", () => {
    expect(workflowCardMatches(card, links, "hong ngoc")).toBe(true);
    expect(workflowCardMatches(card, links, "chỉnh da")).toBe(true);
    expect(workflowCardMatches(card, links, "spreadsheets")).toBe(true);
    expect(workflowCardMatches(card, links, "không có")).toBe(false);
  });
});

describe("workflow age", () => {
  const at = (days: number) => Date.parse("2026-08-01T00:00:00.000Z") + days * 86_400_000;
  it("uses the 7, 10 and over-10-day states", () => {
    expect(workflowAge(card, list, at(4)).level).toBe("normal");
    expect(workflowAge(card, list, at(8)).level).toBe("warning");
    expect(workflowAge(card, list, at(10)).label).toContain("Đã đến hạn");
    expect(workflowAge(card, list, at(12)).label).toContain("Quá 10 ngày");
  });

  it("does not show overdue status for DONE", () => {
    expect(workflowAge(card, { ...list, systemKey: "DONE" }, at(12)).level).toBe("done");
  });
});
