import { describe, expect, it } from "vitest";
import { resolveRestoredSelection } from "@/lib/selection-state";
import type { Draft, Selection } from "@/lib/types";

const selection: Selection = {
  albumId: "album-1",
  sessionId: "submitted-session",
  selectedIds: ["photo-1", "photo-2"],
  largePrintIds: [],
  tablePrintIds: [],
  photoNotes: {},
  albumNote: "",
  submittedAt: "2026-08-14T03:48:56.336Z"
};

function draft(selectedIds: string[], savedAt: string): Draft {
  return {
    albumId: "album-1",
    sessionId: "draft-session",
    selectedIds,
    largePrintIds: [],
    tablePrintIds: [],
    photoNotes: {},
    albumNote: "",
    savedAt
  };
}

describe("resolveRestoredSelection", () => {
  it("keeps the submitted selection when a newer draft is empty", () => {
    const restored = resolveRestoredSelection(draft([], "2026-08-14T06:35:55.792Z"), selection);
    expect(restored.source).toBe("selection");
    expect(restored.saved?.selectedIds).toEqual(["photo-1", "photo-2"]);
  });

  it("keeps the submitted selection when a populated draft is older", () => {
    expect(resolveRestoredSelection(draft(["photo-3"], "2026-08-14T02:00:00.000Z"), selection).source).toBe("selection");
  });

  it("restores a populated draft saved after the submission", () => {
    expect(resolveRestoredSelection(draft(["photo-3"], "2026-08-14T06:35:55.792Z"), selection).source).toBe("draft");
  });

  it("restores a draft when there is no submitted selection", () => {
    expect(resolveRestoredSelection(draft(["photo-3"], "2026-08-14T06:35:55.792Z"), null).source).toBe("draft");
  });
});
