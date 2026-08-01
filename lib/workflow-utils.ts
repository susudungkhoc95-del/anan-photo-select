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
  const days = Math.max(0, Math.floor((currentTime - new Date(base).getTime()) / 86_400_000));
  if (list.systemKey === "DONE") return { days, label: `Hoàn thành · ${days} ngày`, level: "done" as const };
  if (days > 10) return { days, label: `Quá 10 ngày · ${days} ngày`, level: "late" as const };
  if (days === 10) return { days, label: "Đã đến hạn · 10 ngày", level: "late" as const };
  if (days >= 7) return { days, label: `Sắp đến hạn · Đã ${days} ngày`, level: "warning" as const };
  return { days, label: days ? `Đã ${days} ngày` : "Ngày 1", level: "normal" as const };
}
