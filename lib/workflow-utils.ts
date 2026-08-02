import type { WorkflowCard, WorkflowLink, WorkflowList } from "@/lib/types";

export function normalizeWorkflowText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}

export function workflowCardMatches(card: WorkflowCard, links: WorkflowLink[], query: string) {
  const needle = normalizeWorkflowText(query.trim());
  if (!needle) return true;
  return normalizeWorkflowText([card.title, card.note, ...links.flatMap((link) => [link.label, link.url])].join(" ")).includes(needle);
}

export function workflowAge(card: WorkflowCard, list: WorkflowList, currentTime = Date.now()) {
  const base = card.selectionSubmittedAt || card.createdAt;
  // Ngày 1 is the first rolling 24-hour period after submission. The card moves
  // to Ngày 2 exactly 24 hours later, then increments every subsequent 24 hours.
  const submittedAt = new Date(base).getTime();
  const days = Number.isFinite(submittedAt) ? Math.max(1, Math.floor((currentTime - submittedAt) / 86_400_000) + 1) : 1;
  if (list.systemKey === "WAITING_SELECTION") return { days, label: "Chờ khách chọn", level: "normal" as const };
  if (list.systemKey === "DONE") return { days, label: `Hoàn thành · ${days} ngày`, level: "done" as const };
  if (days > 10) return { days, label: `Ngày ${days}`, level: "late" as const };
  if (days >= 7) return { days, label: `Ngày ${days}`, level: "warning" as const };
  return { days, label: `Ngày ${days}`, level: "normal" as const };
}
