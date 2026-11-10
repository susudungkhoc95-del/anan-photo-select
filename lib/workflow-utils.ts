import type { WorkflowBoard, WorkflowCard, WorkflowLink, WorkflowList } from "@/lib/types";

export function normalizeWorkflowText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}

export function parseWorkflowQuery(query: string) {
  const tokens = query.trim().split(/\s+/);
  return {
    hasReturnDate: tokens.some((token) => token.toLowerCase() === "/t"),
    hasWeddingDate: tokens.some((token) => token.toLowerCase() === "/n"),
    text: tokens.filter((token) => !["/t", "/n"].includes(token.toLowerCase())).join(" ")
  };
}

function matchesDateFilter(card: WorkflowCard, parsed: ReturnType<typeof parseWorkflowQuery>, list?: WorkflowList) {
  if (!parsed.hasReturnDate && !parsed.hasWeddingDate) return true;
  return list?.id === card.listId
    && (list.systemKey === "TODO_INBOX" || list.systemKey === "IN_PROGRESS")
    && (!parsed.hasReturnDate || Boolean(card.photoReturnDate.trim()))
    && (!parsed.hasWeddingDate || Boolean(card.weddingDate.trim()));
}

function searchableCardText(card: WorkflowCard, links: WorkflowLink[]) {
  return normalizeWorkflowText([card.title, card.note, ...links.flatMap((link) => [link.label, link.url])].join(" "));
}

export function workflowCardMatches(card: WorkflowCard, links: WorkflowLink[], query: string, labelNames: string[] = [], list?: WorkflowList) {
  const parsed = parseWorkflowQuery(query);
  if (!matchesDateFilter(card, parsed, list)) return false;
  const needle = normalizeWorkflowText(parsed.text);
  return !needle || searchableCardText(card, links).includes(needle)
    || labelNames.some((name) => normalizeWorkflowText(name).includes(needle));
}

export function createWorkflowSearch(board: Pick<WorkflowBoard, "lists" | "links" | "labels" | "cardLabels">) {
  const lists = new Map(board.lists.map((list) => [list.id, list]));
  const labels = new Map(board.labels.map((label) => [label.id, normalizeWorkflowText(label.name)]));
  const linksByCard = new Map<string, WorkflowLink[]>();
  const labelsByCard = new Map<string, string[]>();
  for (const link of board.links) {
    const links = linksByCard.get(link.cardId);
    if (links) links.push(link);
    else linksByCard.set(link.cardId, [link]);
  }
  for (const assignment of board.cardLabels) {
    const name = labels.get(assignment.labelId);
    if (name === undefined) continue;
    const names = labelsByCard.get(assignment.cardId);
    if (names) names.push(name);
    else labelsByCard.set(assignment.cardId, [name]);
  }
  const textByCard = new WeakMap<WorkflowCard, string>();
  return (cards: WorkflowCard[], parsed: ReturnType<typeof parseWorkflowQuery>) => {
    const needle = normalizeWorkflowText(parsed.text);
    return cards.filter((card) => {
      if (!matchesDateFilter(card, parsed, lists.get(card.listId))) return false;
      if (!needle) return true;
      let text = textByCard.get(card);
      if (text === undefined) {
        text = searchableCardText(card, linksByCard.get(card.id) || []);
        textByCard.set(card, text);
      }
      return text.includes(needle) || labelsByCard.get(card.id)?.some((name) => name.includes(needle));
    });
  };
}

export function sortWorkflowCardsByReturnDate(cards: WorkflowCard[], field: "photoReturnDate" | "weddingDate" = "photoReturnDate") {
  // Dates are stored as YYYY-MM-DD. Sort a copy so clearing the date filter restores
  // the board's saved order; equal dates retain their existing order.
  return [...cards].sort((a, b) => a[field].localeCompare(b[field]));
}

export function compareWorkflowDoneCards(a: WorkflowCard, b: WorkflowCard) {
  return (b.completedAt || b.createdAt).localeCompare(a.completedAt || a.createdAt) || b.createdAt.localeCompare(a.createdAt);
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
