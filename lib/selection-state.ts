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

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

/** Whether a draft represents the same choices and notes as the submission. */
export function selectionMatchesDraft(selection: Selection, draft: Draft) {
  if (!sameIds(selection.selectedIds, draft.selectedIds)) return false;
  if (!sameIds(selection.largePrintIds, draft.largePrintIds)) return false;
  if (!sameIds(selection.tablePrintIds, draft.tablePrintIds)) return false;
  if (selection.albumNote !== draft.albumNote) return false;
  const stableNotes = (notes: Record<string, string>) => Object.fromEntries(
    Object.entries(notes).filter(([, value]) => value).sort(([left], [right]) => left.localeCompare(right))
  );
  const selectionNotes = stableNotes(selection.photoNotes);
  const draftNotes = stableNotes(draft.photoNotes);
  return JSON.stringify(selectionNotes) === JSON.stringify(draftNotes);
}
