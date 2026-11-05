import { describe, expect, it } from "vitest";
import { parseWorkflowQuery, sortWorkflowCardsByReturnDate, workflowAge, workflowCardMatches } from "@/lib/workflow-utils";
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

  it("filters wedding dates across active lists and combines text searches", () => {
    const dated = { ...card, weddingDate: "2020-01-01" };
    expect(parseWorkflowQuery(" /N hong ngoc ")).toEqual({ hasReturnDate: false, hasWeddingDate: true, text: "hong ngoc" });
    expect(workflowCardMatches(card, links, "/n", [], list)).toBe(false);
    expect(workflowCardMatches(dated, links, "/n hong ngoc", [], list)).toBe(true);
    expect(workflowCardMatches(dated, links, "/n", [], { ...list, systemKey: "DONE" })).toBe(false);
    expect(workflowCardMatches({ ...dated, weddingDate: " " }, links, "/n", [], list)).toBe(false);
    expect(workflowCardMatches(dated, links, "/n /t", [], list)).toBe(false);
    expect(parseWorkflowQuery("/tra")).toEqual({ hasReturnDate: false, hasWeddingDate: false, text: "/tra" });
    const cards = [{ ...dated, id: "late", weddingDate: "2026-12-01" }, { ...dated, id: "early" }];
    expect(sortWorkflowCardsByReturnDate(cards, "weddingDate").map((c) => c.id)).toEqual(["early", "late"]);
    expect(cards[0].id).toBe("late");
  });

  it("filters cards with a return date, including past dates", () => {
    expect(workflowCardMatches(card, links, "/t", [], list)).toBe(false);
    expect(workflowCardMatches({ ...card, photoReturnDate: "   " }, links, "/t", [], list)).toBe(false);
    expect(workflowCardMatches({ ...card, photoReturnDate: "2020-01-01" }, links, "/t", [], list)).toBe(true);
  });

  it("combines the command with title, note, link and label searches", () => {
    const dated = { ...card, photoReturnDate: "2026-11-02" };
    expect(workflowCardMatches(dated, links, "/T hong ngoc", [], list)).toBe(true);
    expect(workflowCardMatches(dated, links, "chinh da /t", [], list)).toBe(true);
    expect(workflowCardMatches(dated, links, "/t spreadsheets", [], list)).toBe(true);
    expect(workflowCardMatches(dated, links, "/t gap", ["Gấp"], list)).toBe(true);
    expect(workflowCardMatches(card, links, "/t gap", ["Gấp"], list)).toBe(false);
    expect(workflowCardMatches(dated, links, "/t khong co", [], list)).toBe(false);
    expect(workflowCardMatches(card, links, "gap", ["Gấp"])).toBe(true);
    expect(workflowCardMatches(card, links, "")).toBe(true);
  });

  it("recognizes only a complete command token, regardless of case or whitespace", () => {
    expect(parseWorkflowQuery("  /T\tHồng Ngọc  /t ")).toEqual({ hasReturnDate: true, hasWeddingDate: false, text: "Hồng Ngọc" });
    expect(parseWorkflowQuery("/tlai")).toEqual({ hasReturnDate: false, hasWeddingDate: false, text: "/tlai" });
    expect(parseWorkflowQuery("https://example.com/t").hasReturnDate).toBe(false);
  });

  it("limits /t to the todo and in-progress system lists, even after renaming", () => {
    const dated = { ...card, photoReturnDate: "2026-11-02" };
    for (const systemKey of ["TODO_INBOX", "IN_PROGRESS", "DONE", "WAITING_SELECTION", ""] as const) {
      const currentList = { ...list, systemKey, name: "Tên mới" };
      expect(workflowCardMatches(dated, links, "/t", [], currentList)).toBe(systemKey === "TODO_INBOX" || systemKey === "IN_PROGRESS");
      expect(workflowCardMatches(dated, links, "/T hong ngoc", [], currentList)).toBe(systemKey === "TODO_INBOX" || systemKey === "IN_PROGRESS");
      expect(workflowCardMatches(dated, links, "hong ngoc", [], currentList)).toBe(true);
    }
    expect(workflowCardMatches(dated, links, "/t")).toBe(false);
    expect(workflowCardMatches(dated, links, "/t", [], { ...list, id: "other" })).toBe(false);
  });
});

describe("workflow return date order", () => {
  it("puts overdue and earlier deadlines first across months and years without changing saved order", () => {
    const dates = ["2027-01-01", "2026-11-04", "2026-10-26", "2026-11-01", "2026-11-01", "2026-12-31"];
    const cards = dates.map((photoReturnDate, index) => ({ ...card, id: String(index), photoReturnDate }));
    const sorted = sortWorkflowCardsByReturnDate(cards);
    expect(sorted.map((item) => item.id)).toEqual(["2", "3", "4", "1", "5", "0"]);
    expect(cards.map((item) => item.photoReturnDate)).toEqual(dates);
    expect(sorted).not.toBe(cards);
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
