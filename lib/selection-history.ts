import { createHash } from "crypto";
import type { Selection } from "@/lib/types";

export type SelectionSnapshot = Pick<Selection, "selectedIds" | "largePrintIds" | "tablePrintIds" | "photoNotes" | "albumNote">;

function stableNotes(notes: Record<string, string>) {
  return Object.fromEntries(Object.entries(notes || {}).filter(([, value]) => value).sort(([left], [right]) => left.localeCompare(right)));
}

export function selectionContentHash(selection: SelectionSnapshot) {
  const canonical = JSON.stringify({
    selectedIds: selection.selectedIds,
    largePrintIds: selection.largePrintIds,
    tablePrintIds: selection.tablePrintIds,
    photoNotes: stableNotes(selection.photoNotes),
    albumNote: selection.albumNote || ""
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function difference(current: string[], previous: string[]) {
  const oldIds = new Set(previous);
  const newIds = new Set(current);
  return { added: current.filter((id) => !oldIds.has(id)).length, removed: previous.filter((id) => !newIds.has(id)).length };
}

export function selectionChangeSummary(previous: SelectionSnapshot | null, current: SelectionSnapshot) {
  if (!previous) return "Lần gửi đầu tiên";
  const selected = difference(current.selectedIds, previous.selectedIds);
  const large = difference(current.largePrintIds, previous.largePrintIds);
  const table = difference(current.tablePrintIds, previous.tablePrintIds);
  const changes: string[] = [];
  if (selected.added || selected.removed) changes.push(`ảnh +${selected.added}/-${selected.removed}`);
  if (large.added || large.removed) changes.push(`60×90 +${large.added}/-${large.removed}`);
  if (table.added || table.removed) changes.push(`để bàn +${table.added}/-${table.removed}`);
  if ((previous.albumNote || "") !== (current.albumNote || "")) changes.push("đổi lưu ý chung");
  if (JSON.stringify(stableNotes(previous.photoNotes)) !== JSON.stringify(stableNotes(current.photoNotes))) changes.push("đổi ghi chú riêng");
  return changes.length ? changes.join(", ") : "Không có thay đổi nội dung";
}
