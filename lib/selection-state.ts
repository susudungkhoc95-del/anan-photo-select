import type { Draft, Selection } from "@/lib/types";

type RestoredSelection =
  | { source: "draft"; saved: Draft }
  | { source: "selection"; saved: Selection }
  | { source: null; saved: null };

/**
 * A submitted selection is the durable baseline. Restore a draft over it only
 * when the draft contains a usable selection and was saved after submission.
 * This prevents an empty autosave from making a completed submission appear
 * to contain zero photos.
 */
export function resolveRestoredSelection(draft: Draft | null, selection: Selection | null): RestoredSelection {
  if (!selection) return draft ? { source: "draft", saved: draft } : { source: null, saved: null };
  if (!draft) return { source: "selection", saved: selection };

  const draftTime = Date.parse(draft.savedAt);
  const selectionTime = Date.parse(selection.submittedAt);
  const isNewer = Number.isFinite(draftTime) && Number.isFinite(selectionTime) && draftTime > selectionTime;
  const hasSelectedPhotos = Array.isArray(draft.selectedIds) && draft.selectedIds.length > 0;

  return isNewer && hasSelectedPhotos
    ? { source: "draft", saved: draft }
    : { source: "selection", saved: selection };
}
