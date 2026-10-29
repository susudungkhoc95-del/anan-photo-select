import { describe, expect, it } from "vitest";
import { parseWorkflowQuery, workflowAge, workflowCardMatches } from "@/lib/workflow-utils";
import type { WorkflowCard, WorkflowLink, WorkflowList } from "@/lib/types";

const list: WorkflowList = { id: "todo", workspaceId: "studio", name: "CẦN LÀM", position: 0, systemKey: "TODO_INBOX", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
const card: WorkflowCard = { id: "card", workspaceId: "studio", listId: "todo", title: "Hồng Ngọc & Trần Quang", note: "Ưu tiên chỉnh da", weddingDate: "", photoReturnDate: "", position: 0, orderKey: "00000000000000", source: "dp_select", dpSelectAlbumId: "album", dpSelectSubmissionId: "submission", selectionSubmittedAt: "2026-08-01T00:00:00.000Z", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", completedAt: "", createdBy: "dp_select", dpSummary: "", dpAlbumNote: "", dpPhotoNoteCount: 0 };
const links: WorkflowLink[] = [{ id: "link", workspaceId: "studio", cardId: "card", label: "Sheet ảnh chọn", url: "https://docs.google.com/spreadsheets/d/example", position: 0, createdAt: card.createdAt, updatedAt: card.updatedAt }];

describe("workflow search", () => {
  it("finds title, note and links without accents", () => {
    expect(workflowCardMatches(card, links, "hong ngoc")).toBe(true);
    expect(workflowCardMatches(card, links, "chỉnh da")).toBe(true);
    expect(workflowCardMatches(card, links, "spreadsheets")).toBe(true);
    expect(workflowCardMatches(card, links, "không có")).toBe(false);
  });

  it("filters cards with a return date, including past dates", () => {
    expect(workflowCardMatches(card, links, "/tra")).toBe(false);
    expect(workflowCardMatches({ ...card, photoReturnDate: "   " }, links, "/tra")).toBe(false);
    expect(workflowCardMatches({ ...card, photoReturnDate: "2020-01-01" }, links, "/tra")).toBe(true);
  });

  it("combines the command with title, note, link and label searches", () => {
    const dated = { ...card, photoReturnDate: "2026-11-02" };
    expect(workflowCardMatches(dated, links, "/TRA hong ngoc")).toBe(true);
    expect(workflowCardMatches(dated, links, "chinh da /tra")).toBe(true);
    expect(workflowCardMatches(dated, links, "/tra spreadsheets")).toBe(true);
    expect(workflowCardMatches(dated, links, "/tra gap", ["Gấp"])).toBe(true);
    expect(workflowCardMatches(card, links, "/tra gap", ["Gấp"])).toBe(false);
    expect(workflowCardMatches(dated, links, "/tra khong co")).toBe(false);
    expect(workflowCardMatches(card, links, "gap", ["Gấp"])).toBe(true);
    expect(workflowCardMatches(card, links, "")).toBe(true);
  });

  it("recognizes only a complete command token, regardless of case or whitespace", () => {
    expect(parseWorkflowQuery("  /TRA\tHồng Ngọc  /tra ")).toEqual({ hasReturnDate: true, text: "Hồng Ngọc" });
    expect(parseWorkflowQuery("/tralai")).toEqual({ hasReturnDate: false, text: "/tralai" });
    expect(parseWorkflowQuery("https://example.com/tra").hasReturnDate).toBe(false);
  });
});

describe("workflow age", () => {
  const at = (days: number) => Date.parse("2026-08-01T00:00:00.000Z") + days * 86_400_000;
  it("uses rolling 24-hour periods, counting the first period as Ngày 1", () => {
    expect(workflowAge(card, list, at(1)).label).toBe("Ngày 2");
    expect(workflowAge(card, list, at(4)).level).toBe("normal");
    expect(workflowAge(card, list, at(8)).level).toBe("warning");
    expect(workflowAge(card, list, at(9)).label).toBe("Ngày 10");
    expect(workflowAge(card, list, at(12)).label).toBe("Ngày 13");
  });

  it("does not show overdue status for DONE", () => {
    expect(workflowAge(card, { ...list, systemKey: "DONE" }, at(12)).level).toBe("done");
  });
});
