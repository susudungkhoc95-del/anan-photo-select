import { describe, expect, it } from "vitest";
import { newestDraft, resolveRestoredSelection, selectionMatchesDraft } from "@/lib/selection-state";
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

  it("restores an explicit clear saved after the submission", () => {
    const cleared = { ...draft([], "2026-08-14T06:35:55.792Z"), cleared: true as const };
    expect(resolveRestoredSelection(cleared, selection)).toEqual({ source: "draft", saved: cleared });
  });

  it("restores a draft when there is no submitted selection", () => {
    expect(resolveRestoredSelection(draft(["photo-3"], "2026-08-14T06:35:55.792Z"), null).source).toBe("draft");
  });

  it("does not call an identical autosave a pending change", () => {
    const savedDraft = draft(["photo-2", "photo-1"], "2026-08-14T06:35:55.792Z");
    expect(selectionMatchesDraft(selection, savedDraft)).toBe(true);
  });

  it("detects a changed selection in a draft", () => {
    expect(selectionMatchesDraft(selection, draft(["photo-3"], "2026-08-14T06:35:55.792Z"))).toBe(false);
  });
});

describe("newestDraft", () => {
  const local = draft(Array.from({ length: 38 }, (_, i) => `photo-${i}`), "2026-08-14T02:00:00.000Z");
  const newerEmpty = draft([], "2026-08-14T06:35:55.792Z");

  it("recovers 38 local choices over a legacy empty server autosave", () => {
    expect(newestDraft(newerEmpty, local)).toBe(local);
  });

  it("honors a more recent intentional clear", () => {
    const cleared = { ...newerEmpty, cleared: true as const };
    expect(newestDraft(cleared, local)).toBe(cleared);
  });

  it("prefers an equally recent server copy to avoid resending an already synced draft", () => {
    const server = { ...local };
    expect(newestDraft(server, local)).toBe(server);
  });
});
