import { createHash, randomUUID } from "crypto";
import { getWorkflowWorkspaceId, listAlbums } from "@/lib/google";
import type { Album, Selection, WorkflowActivity, WorkflowBoard, WorkflowCard, WorkflowCardLabel, WorkflowLabel, WorkflowLink, WorkflowList } from "@/lib/types";
import { readAppRecords, removeAppRecord, saveAppRecord } from "@/lib/supabase";

const TABS = {
  lists: "WorkflowLists",
  cards: "WorkflowCards",
  links: "WorkflowLinks",
  activities: "WorkflowActivities",
  labels: "WorkflowLabels",
  cardLabels: "WorkflowCardLabels"
} as const;

const LABEL_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"] as const;

type TabName = (typeof TABS)[keyof typeof TABS];
const workspaceQueues = new Map<string, Promise<void>>();

function text(value: unknown, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function requiredText(value: unknown, label: string, max = 200) {
  const result = text(value, max);
  if (!result) throw new Error(`${label} không được để trống.`);
  return result;
}

function position(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function now() { return new Date().toISOString(); }

function isUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

async function serialise<T>(workspaceId: string, work: () => Promise<T>) {
  const previous = workspaceQueues.get(workspaceId) || Promise.resolve();
  let release!: () => void;
  const queued = new Promise<void>((resolve) => { release = resolve; });
  workspaceQueues.set(workspaceId, queued);
  await previous.catch(() => {});
  try { return await work(); }
  finally {
    release();
    if (workspaceQueues.get(workspaceId) === queued) workspaceQueues.delete(workspaceId);
  }
}

async function rows(tab: TabName) {
  const records = await readAppRecords(tab);
  return records.map((record) => ({
    id: record.record_id,
    workspaceId: record.workspace_id,
    values: Array.isArray(record.payload) ? record.payload.map((cell) => String(cell ?? "")) : []
  })).filter((item) => item.values[0]);
}

async function writeRow(tab: TabName, id: string, workspaceId: string, values: string[]) {
  await saveAppRecord(tab, id, values, workspaceId);
}

async function clearRecord(tab: TabName, id: string, workspaceId: string) {
  await removeAppRecord(tab, id, workspaceId);
}

function listFrom(values: string[]): WorkflowList {
  return { id: values[0], workspaceId: values[1], name: values[2], position: position(values[3]), systemKey: values[4] as WorkflowList["systemKey"], createdAt: values[5], updatedAt: values[6] };
}
function cardFrom(values: string[]): WorkflowCard {
  return { id: values[0], workspaceId: values[1], listId: values[2], title: values[3], note: values[4], weddingDate: values[15] || "", position: position(values[5]), source: values[6] === "dp_select" ? "dp_select" : "manual", dpSelectAlbumId: values[7], dpSelectSubmissionId: values[8], selectionSubmittedAt: values[9], createdAt: values[10], updatedAt: values[11], completedAt: values[12], createdBy: values[13], dpSummary: values[14] || "" };
}
function linkFrom(values: string[]): WorkflowLink {
  return { id: values[0], workspaceId: values[1], cardId: values[2], label: values[3], url: values[4], position: position(values[5]), createdAt: values[6], updatedAt: values[7] };
}
function activityFrom(values: string[]): WorkflowActivity {
  return { id: values[0], workspaceId: values[1], cardId: values[2], activityType: values[3], description: values[4], oldValue: values[5], newValue: values[6], actorId: values[7], actorName: values[8], source: values[9] === "dp_select" ? "dp_select" : "manual", createdAt: values[10] };
}
function labelFrom(values: string[]): WorkflowLabel {
  return { id: values[0], workspaceId: values[1], name: values[2], color: values[3] || "#3b82f6", position: position(values[4]), createdAt: values[5], updatedAt: values[6] };
}
function cardLabelFrom(values: string[]): WorkflowCardLabel {
  return { id: values[0], workspaceId: values[1], cardId: values[2], labelId: values[3], createdAt: values[4] };
}

function listValues(record: WorkflowList) { return [record.id, record.workspaceId, record.name, String(record.position), record.systemKey, record.createdAt, record.updatedAt]; }
function cardValues(record: WorkflowCard) { return [record.id, record.workspaceId, record.listId, record.title, record.note, String(record.position), record.source, record.dpSelectAlbumId, record.dpSelectSubmissionId, record.selectionSubmittedAt, record.createdAt, record.updatedAt, record.completedAt, record.createdBy, record.dpSummary, record.weddingDate]; }
function linkValues(record: WorkflowLink) { return [record.id, record.workspaceId, record.cardId, record.label, record.url, String(record.position), record.createdAt, record.updatedAt]; }
function activityValues(record: WorkflowActivity) { return [record.id, record.workspaceId, record.cardId, record.activityType, record.description, record.oldValue, record.newValue, record.actorId, record.actorName, record.source, record.createdAt]; }
function labelValues(record: WorkflowLabel) { return [record.id, record.workspaceId, record.name, record.color, String(record.position), record.createdAt, record.updatedAt]; }
function cardLabelValues(record: WorkflowCardLabel) { return [record.id, record.workspaceId, record.cardId, record.labelId, record.createdAt]; }

async function readBoard(workspaceId: string): Promise<WorkflowBoard> {
  const values = await Promise.all(Object.values(TABS).map((tab) => rows(tab)));
  const scope = (index: number) => values[index].filter((row) => row.workspaceId === workspaceId).map((row) => row.values);
  return {
    workspaceId,
    lists: scope(0).map(listFrom).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    cards: scope(1).map(cardFrom).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    links: scope(2).map(linkFrom).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    activities: scope(3).map(activityFrom).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    labels: scope(4).map(labelFrom).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    cardLabels: scope(5).map(cardLabelFrom)
  };
}

async function appendActivity(workspaceId: string, cardId: string, activityType: string, description: string, source: WorkflowActivity["source"], oldValue = "", newValue = "") {
  const record: WorkflowActivity = { id: randomUUID(), workspaceId, cardId, activityType, description, oldValue, newValue, actorId: source === "dp_select" ? "dp_select" : "admin", actorName: source === "dp_select" ? "DP Select" : "Quản trị", source, createdAt: now() };
  await writeRow(TABS.activities, record.id, workspaceId, activityValues(record));
  return record;
}

async function ensureDefaultLists(workspaceId: string) {
  const board = await readBoard(workspaceId);
  const defaults: Array<{ name: string; systemKey: WorkflowList["systemKey"] }> = [
    { name: "CẦN LÀM", systemKey: "TODO_INBOX" },
    { name: "ĐANG LÀM", systemKey: "IN_PROGRESS" },
    { name: "DONE", systemKey: "DONE" },
    { name: "CHƯA CHỌN XONG", systemKey: "WAITING_SELECTION" }
  ];
  let nextPosition = Math.max(-1, ...board.lists.map((list) => list.position)) + 1;
  for (const item of defaults) {
    if (board.lists.some((list) => list.systemKey === item.systemKey)) continue;
    const timestamp = now();
    const list: WorkflowList = { id: randomUUID(), workspaceId, name: item.name, position: nextPosition++, systemKey: item.systemKey, createdAt: timestamp, updatedAt: timestamp };
    await writeRow(TABS.lists, list.id, workspaceId, listValues(list));
  }
}

async function activeAlbums() {
  const items: Array<Album & { clientUrl: string }> = [];
  let offset = 0;
  do {
    const page = await listAlbums({ status: "active", sortOrder: "oldest", offset, limit: 80 }) as { items: Array<Album & { clientUrl: string }>; hasMore: boolean; nextOffset: number };
    items.push(...page.items);
    offset = page.nextOffset;
    if (!page.hasMore) return items;
  } while (offset < 10_000);
  return items;
}

async function syncCustomerChatLink(workspaceId: string, links: WorkflowLink[], cardId: string, customerChatUrl?: string) {
  if (!customerChatUrl) return;
  const current = links.find((link) => link.cardId === cardId && link.label === "Nhóm chat khách");
  if (current) {
    if (current.url === customerChatUrl) return;
    current.url = customerChatUrl;
    current.updatedAt = now();
    await writeRow(TABS.links, current.id, workspaceId, linkValues(current));
    return;
  }
  const timestamp = now();
  const record: WorkflowLink = { id: randomUUID(), workspaceId, cardId, label: "Nhóm chat khách", url: customerChatUrl, position: Math.max(-1, ...links.filter((link) => link.cardId === cardId).map((link) => link.position)) + 1, createdAt: timestamp, updatedAt: timestamp };
  await writeRow(TABS.links, record.id, workspaceId, linkValues(record));
  links.push(record);
}

/** Keeps a final system column in sync with active albums that customers have not submitted yet. */
async function syncWaitingSelectionCards(workspaceId: string, board: WorkflowBoard): Promise<WorkflowBoard> {
  const waiting = board.lists.find((list) => list.systemKey === "WAITING_SELECTION");
  if (!waiting) return board;
  const albums = await activeAlbums();
  const existingByAlbumId = new Map(board.cards.filter((card) => card.dpSelectAlbumId).map((card) => [card.dpSelectAlbumId, card]));
  let nextPosition = Math.max(-1, ...board.cards.filter((card) => card.listId === waiting.id).map((card) => card.position)) + 1;
  let changed = false;
  for (const album of albums) {
    const existing = existingByAlbumId.get(album.id);
    if (existing) {
      await syncCustomerChatLink(workspaceId, board.links, existing.id, album.customerChatUrl);
      continue;
    }
    if (album.submittedAt) continue;
    const timestamp = now();
    // The card represents the album from its creation, even though Workflow may
    // first discover it a few moments later during a background sync.
    const cardCreatedAt = album.createdAt || timestamp;
    const cardId = `dp_${createHash("sha256").update(`${workspaceId}:${album.id}`).digest("hex").slice(0, 24)}`;
    const card: WorkflowCard = {
      id: cardId, workspaceId, listId: waiting.id, title: text(album.title, 200) || "Album DP Select", note: "", weddingDate: "", position: nextPosition++,
      source: "dp_select", dpSelectAlbumId: album.id, dpSelectSubmissionId: "", selectionSubmittedAt: "", createdAt: cardCreatedAt, updatedAt: timestamp,
      completedAt: "", createdBy: "dp_select", dpSummary: `Chờ khách gửi ảnh chọn · ${album.photoCount} ảnh trong album`
    };
    await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
    const link: WorkflowLink = { id: randomUUID(), workspaceId, cardId: card.id, label: "Link chọn ảnh", url: album.clientUrl, position: 0, createdAt: timestamp, updatedAt: timestamp };
    await writeRow(TABS.links, link.id, workspaceId, linkValues(link));
    if (album.customerChatUrl) {
      const chatLink: WorkflowLink = { id: randomUUID(), workspaceId, cardId: card.id, label: "Nhóm chat khách", url: album.customerChatUrl, position: 1, createdAt: timestamp, updatedAt: timestamp };
      await writeRow(TABS.links, chatLink.id, workspaceId, linkValues(chatLink));
    }
    await appendActivity(workspaceId, card.id, "CARD_WAITING_FOR_SELECTION", "Đã tạo thẻ chờ khách gửi ảnh chọn.", "dp_select");
    changed = true;
  }
  return changed ? readBoard(workspaceId) : board;
}

async function boardForCurrentWorkspace() {
  const workspaceId = getWorkflowWorkspaceId();
  await ensureDefaultLists(workspaceId);
  return syncWaitingSelectionCards(workspaceId, await readBoard(workspaceId));
}

function findList(board: WorkflowBoard, id: unknown) {
  const list = board.lists.find((item) => item.id === text(id, 100));
  if (!list) throw new Error("Không tìm thấy danh sách.");
  return list;
}

function findCard(board: WorkflowBoard, id: unknown) {
  const card = board.cards.find((item) => item.id === text(id, 100));
  if (!card) throw new Error("Không tìm thấy thẻ.");
  return card;
}

function findLabel(board: WorkflowBoard, id: unknown) {
  const label = board.labels.find((item) => item.id === text(id, 100));
  if (!label) throw new Error("Không tìm thấy nhãn.");
  return label;
}

async function syncNoteLabel(workspaceId: string, board: WorkflowBoard, card: WorkflowCard) {
  const labelName = "Có ghi chú";
  let noteLabel = board.labels.find((label) => label.name.trim().toLocaleLowerCase() === labelName.toLocaleLowerCase());
  if (card.note.trim() && !noteLabel) {
    const timestamp = now();
    noteLabel = { id: randomUUID(), workspaceId, name: labelName, color: "#3b82f6", position: Math.max(-1, ...board.labels.map((label) => label.position)) + 1, createdAt: timestamp, updatedAt: timestamp };
    await writeRow(TABS.labels, noteLabel.id, workspaceId, labelValues(noteLabel));
    board.labels.push(noteLabel);
  }
  if (!noteLabel) return;
  const assignments = board.cardLabels.filter((assignment) => assignment.cardId === card.id && assignment.labelId === noteLabel!.id);
  if (card.note.trim() && !assignments.length) {
    const assignment: WorkflowCardLabel = { id: randomUUID(), workspaceId, cardId: card.id, labelId: noteLabel.id, createdAt: now() };
    await writeRow(TABS.cardLabels, assignment.id, workspaceId, cardLabelValues(assignment));
    board.cardLabels.push(assignment);
  } else if (!card.note.trim()) {
    await Promise.all(assignments.map((assignment) => clearRecord(TABS.cardLabels, assignment.id, workspaceId)));
  }
}

function labelColor(value: unknown) {
  const color = text(value, 7);
  if (!(LABEL_COLORS as readonly string[]).includes(color.toLowerCase())) throw new Error("Hãy chọn một trong 6 màu nhãn có sẵn.");
  return color.toLowerCase();
}

function normalizeWeddingDate(value: unknown) {
  const date = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

async function resequenceCards(workspaceId: string, cards: WorkflowCard[], orderedIds: string[]) {
  const idSet = new Set(cards.map((card) => card.id));
  if (orderedIds.length !== cards.length || orderedIds.some((id) => !idSet.has(id)) || new Set(orderedIds).size !== orderedIds.length) throw new Error("Thứ tự thẻ không hợp lệ.");
  await Promise.all(orderedIds.map(async (id, index) => {
    const card = cards.find((item) => item.id === id)!;
    if (card.position === index) return;
    card.position = index; card.updatedAt = now();
    await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
  }));
}

export async function getWorkflowBoard() {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, boardForCurrentWorkspace);
}

export async function createWorkflowList(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const timestamp = now();
    const record: WorkflowList = { id: randomUUID(), workspaceId, name: requiredText(payload.name, "Tên danh sách"), position: Math.max(-1, ...board.lists.map((list) => list.position)) + 1, systemKey: "", createdAt: timestamp, updatedAt: timestamp };
    await writeRow(TABS.lists, record.id, workspaceId, listValues(record));
    return record;
  });
}

export async function updateWorkflowList(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const record = findList(board, payload.listId);
    const name = requiredText(payload.name, "Tên danh sách");
    if (name !== record.name) { record.name = name; record.updatedAt = now(); await writeRow(TABS.lists, record.id, workspaceId, listValues(record)); }
    return record;
  });
}

export async function reorderWorkflowLists(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    let orderedIds = Array.isArray(payload.orderedIds) ? payload.orderedIds.map((id) => text(id, 100)) : [];
    const valid = new Set(board.lists.map((list) => list.id));
    if (orderedIds.length !== board.lists.length || orderedIds.some((id) => !valid.has(id)) || new Set(orderedIds).size !== orderedIds.length) throw new Error("Thứ tự danh sách không hợp lệ.");
    const waitingId = board.lists.find((list) => list.systemKey === "WAITING_SELECTION")?.id;
    if (waitingId) orderedIds = [...orderedIds.filter((id) => id !== waitingId), waitingId];
    await Promise.all(orderedIds.map(async (id, index) => {
      const record = board.lists.find((list) => list.id === id)!;
      if (record.position === index) return;
      record.position = index; record.updatedAt = now();
      await writeRow(TABS.lists, record.id, workspaceId, listValues(record));
    }));
    return { ok: true };
  });
}

export async function deleteWorkflowList(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const record = findList(board, payload.listId);
    if (record.systemKey === "WAITING_SELECTION") throw new Error("Danh sách chờ khách chọn ảnh là danh sách hệ thống, không thể xoá.");
    const cards = board.cards.filter((card) => card.listId === record.id);
    const requiresTarget = cards.length > 0 || record.systemKey === "TODO_INBOX";
    const target = requiresTarget ? findList(board, payload.targetListId) : undefined;
    if (target?.id === record.id) throw new Error("Hãy chọn danh sách khác để chuyển thẻ.");
    if (record.systemKey === "TODO_INBOX" && !target) throw new Error("Danh sách nhận thẻ tự động phải được chuyển sang một danh sách khác.");
    if (target && record.systemKey === "TODO_INBOX") { target.systemKey = "TODO_INBOX"; target.updatedAt = now(); await writeRow(TABS.lists, target.id, workspaceId, listValues(target)); }
    for (const card of cards) {
      card.listId = target!.id; card.updatedAt = now();
      await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
      await appendActivity(workspaceId, card.id, "CARD_MOVED", `Đã chuyển thẻ từ “${record.name}” sang “${target!.name}”.`, "manual", record.id, target!.id);
    }
    await clearRecord(TABS.lists, record.id, workspaceId);
    return { ok: true };
  });
}

export async function createWorkflowCard(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const list = findList(board, payload.listId || board.lists[0]?.id);
    const timestamp = now();
    const card: WorkflowCard = { id: randomUUID(), workspaceId, listId: list.id, title: requiredText(payload.title, "Tên thẻ"), note: text(payload.note, 5000), weddingDate: normalizeWeddingDate(payload.weddingDate), position: Math.max(-1, ...board.cards.filter((item) => item.listId === list.id).map((item) => item.position)) + 1, source: "manual", dpSelectAlbumId: "", dpSelectSubmissionId: "", selectionSubmittedAt: "", createdAt: timestamp, updatedAt: timestamp, completedAt: list.systemKey === "DONE" ? timestamp : "", createdBy: "admin", dpSummary: "" };
    await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
    await syncNoteLabel(workspaceId, board, card);
    await appendActivity(workspaceId, card.id, "CARD_CREATED", "Đã tạo thẻ thủ công.", "manual");
    return card;
  });
}

export async function updateWorkflowCard(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const card = findCard(board, payload.cardId);
    const title = requiredText(payload.title, "Tên thẻ");
    const note = text(payload.note, 5000);
    const weddingDate = payload.weddingDate === undefined ? card.weddingDate : normalizeWeddingDate(payload.weddingDate);
    if (card.title !== title) await appendActivity(workspaceId, card.id, "CARD_TITLE_UPDATED", "Đã cập nhật tên thẻ.", "manual", card.title, title);
    if (card.note !== note) await appendActivity(workspaceId, card.id, "CARD_NOTE_UPDATED", "Đã cập nhật ghi chú.", "manual", card.note, note);
    card.title = title; card.note = note; card.weddingDate = weddingDate; card.updatedAt = now();
    await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
    await syncNoteLabel(workspaceId, board, card);
    return card;
  });
}

export async function moveWorkflowCard(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const card = findCard(board, payload.cardId);
    const sourceList = findList(board, card.listId);
    const targetList = findList(board, payload.targetListId);
    const orderedIds = Array.isArray(payload.orderedIds) ? payload.orderedIds.map((id) => text(id, 100)) : [];
    const targetCards = board.cards.filter((item) => item.listId === targetList.id && item.id !== card.id);
    card.listId = targetList.id;
    if (targetList.systemKey === "DONE" && !card.completedAt) card.completedAt = now();
    card.updatedAt = now();
    await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
    await resequenceCards(workspaceId, [...targetCards, card], orderedIds);
    if (sourceList.id !== targetList.id) {
      const sourceOrderedIds = Array.isArray(payload.sourceOrderedIds) ? payload.sourceOrderedIds.map((id) => text(id, 100)) : [];
      await resequenceCards(workspaceId, board.cards.filter((item) => item.listId === sourceList.id && item.id !== card.id), sourceOrderedIds);
    }
    if (sourceList.id !== targetList.id) await appendActivity(workspaceId, card.id, "CARD_MOVED", `Đã chuyển thẻ từ “${sourceList.name}” sang “${targetList.name}”.`, "manual", sourceList.id, targetList.id);
    return card;
  });
}

export async function deleteWorkflowCard(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const card = findCard(board, payload.cardId);
    await clearRecord(TABS.cards, card.id, workspaceId);
    await Promise.all(board.links.filter((link) => link.cardId === card.id).map((link) => clearRecord(TABS.links, link.id, workspaceId)));
    await Promise.all(board.cardLabels.filter((assignment) => assignment.cardId === card.id).map((assignment) => clearRecord(TABS.cardLabels, assignment.id, workspaceId)));
    await Promise.all(board.activities.filter((activity) => activity.cardId === card.id).map((activity) => clearRecord(TABS.activities, activity.id, workspaceId)));
    return { ok: true };
  });
}

export async function createWorkflowLabel(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const timestamp = now();
    const record: WorkflowLabel = { id: randomUUID(), workspaceId, name: requiredText(payload.name, "Tên nhãn", 60), color: labelColor(payload.color || "#3b82f6"), position: Math.max(-1, ...board.labels.map((label) => label.position)) + 1, createdAt: timestamp, updatedAt: timestamp };
    await writeRow(TABS.labels, record.id, workspaceId, labelValues(record));
    return record;
  });
}

export async function updateWorkflowLabel(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const record = findLabel(board, payload.labelId);
    record.name = requiredText(payload.name, "Tên nhãn", 60);
    record.color = labelColor(payload.color);
    record.updatedAt = now();
    await writeRow(TABS.labels, record.id, workspaceId, labelValues(record));
    return record;
  });
}

export async function deleteWorkflowLabel(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const record = findLabel(board, payload.labelId);
    const assignments = board.cardLabels.filter((assignment) => assignment.labelId === record.id);
    await clearRecord(TABS.labels, record.id, workspaceId);
    await Promise.all(assignments.map((assignment) => clearRecord(TABS.cardLabels, assignment.id, workspaceId)));
    await Promise.all([...new Set(assignments.map((assignment) => assignment.cardId))].map((cardId) => appendActivity(workspaceId, cardId, "LABEL_REMOVED", `Đã xoá nhãn “${record.name}”.`, "manual")));
    return { ok: true };
  });
}

export async function setWorkflowCardLabels(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const card = findCard(board, payload.cardId);
    await syncNoteLabel(workspaceId, board, card);
    const labelIds = Array.isArray(payload.labelIds) ? payload.labelIds.map((id) => text(id, 100)).filter(Boolean) : [];
    if (new Set(labelIds).size !== labelIds.length) throw new Error("Nhãn bị trùng.");
    labelIds.forEach((id) => findLabel(board, id));
    const current = board.cardLabels.filter((assignment) => assignment.cardId === card.id);
    const currentIds = new Set(current.map((assignment) => assignment.labelId));
    const targetIds = new Set(labelIds);
    const noteLabel = board.labels.find((label) => label.name.trim().toLocaleLowerCase() === "có ghi chú");
    if (card.note.trim() && noteLabel) targetIds.add(noteLabel.id);
    if (!card.note.trim() && noteLabel) targetIds.delete(noteLabel.id);
    await Promise.all(current.filter((assignment) => !targetIds.has(assignment.labelId)).map((assignment) => clearRecord(TABS.cardLabels, assignment.id, workspaceId)));
    const timestamp = now();
    for (const labelId of targetIds) {
      if (currentIds.has(labelId)) continue;
      const assignment: WorkflowCardLabel = { id: randomUUID(), workspaceId, cardId: card.id, labelId, createdAt: timestamp };
      await writeRow(TABS.cardLabels, assignment.id, workspaceId, cardLabelValues(assignment));
    }
    const oldValue = current.map((assignment) => assignment.labelId).sort().join(",");
    const newValue = [...targetIds].sort().join(",");
    if (oldValue !== newValue) await appendActivity(workspaceId, card.id, "CARD_LABELS_UPDATED", "Đã cập nhật nhãn.", "manual", oldValue, newValue);
    return { ok: true };
  });
}

export async function createWorkflowLink(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const card = findCard(board, payload.cardId);
    const url = requiredText(payload.url, "URL", 2000);
    if (!isUrl(url)) throw new Error("Link phải bắt đầu bằng http:// hoặc https://.");
    const timestamp = now();
    const record: WorkflowLink = { id: randomUUID(), workspaceId, cardId: card.id, label: requiredText(payload.label, "Tên hiển thị"), url, position: Math.max(-1, ...board.links.filter((link) => link.cardId === card.id).map((link) => link.position)) + 1, createdAt: timestamp, updatedAt: timestamp };
    await writeRow(TABS.links, record.id, workspaceId, linkValues(record));
    await appendActivity(workspaceId, card.id, "LINK_ADDED", `Đã thêm link “${record.label}”.`, "manual");
    return record;
  });
}

export async function updateWorkflowLink(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const record = board.links.find((link) => link.id === text(payload.linkId, 100));
    if (!record) throw new Error("Không tìm thấy link.");
    const url = requiredText(payload.url, "URL", 2000);
    if (!isUrl(url)) throw new Error("Link phải bắt đầu bằng http:// hoặc https://.");
    record.label = requiredText(payload.label, "Tên hiển thị"); record.url = url; record.updatedAt = now();
    await writeRow(TABS.links, record.id, workspaceId, linkValues(record));
    await appendActivity(workspaceId, record.cardId, "LINK_UPDATED", `Đã cập nhật link “${record.label}”.`, "manual");
    return record;
  });
}

export async function deleteWorkflowLink(payload: Record<string, unknown>) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const record = board.links.find((link) => link.id === text(payload.linkId, 100));
    if (!record) throw new Error("Không tìm thấy link.");
    await clearRecord(TABS.links, record.id, workspaceId);
    await appendActivity(workspaceId, record.cardId, "LINK_DELETED", `Đã xoá link “${record.label}”.`, "manual");
    return { ok: true };
  });
}

function dpSelectionSummary(selection: Selection) {
  const selected = new Set(selection.selectedIds);
  const printIds = new Set([...selection.largePrintIds, ...selection.tablePrintIds]);
  const soft = [...selected].filter((id) => !printIds.has(id)).length;
  return `${selected.size} ảnh đã chọn · Phóng 60×90: ${selection.largePrintIds.length} · Để bàn: ${selection.tablePrintIds.length} · File mềm: ${soft}`;
}

/**
 * Called only after DP Select has persisted the selection and its result spreadsheet.
 * Google Sheets has no cross-request transaction; a deterministic card id plus a server
 * queue makes the operation idempotent in warm instances, while later submissions repair
 * an interrupted write rather than creating a second logical card.
 */
export async function createOrUpdateCardFromSelection(album: Album, selection: Selection, spreadsheetUrl: string) {
  const workspaceId = getWorkflowWorkspaceId();
  return serialise(workspaceId, async () => {
    const board = await boardForCurrentWorkspace();
    const todo = board.lists.find((list) => list.systemKey === "TODO_INBOX");
    const waiting = board.lists.find((list) => list.systemKey === "WAITING_SELECTION");
    if (!todo) throw new Error("Workflow chưa có danh sách nhận thẻ tự động.");
    const matching = board.cards.filter((card) => card.dpSelectAlbumId === album.id);
    const existing = matching[0];
    if (existing) {
      const wasWaiting = Boolean(waiting && existing.listId === waiting.id);
      existing.dpSelectSubmissionId = selection.sessionId;
      // Keep the original customer submission as the work-age baseline.
      // Re-submitting choices updates the result sheet but must not reset “Ngày N”.
      existing.selectionSubmittedAt = existing.selectionSubmittedAt || selection.submittedAt;
      existing.dpSummary = dpSelectionSummary(selection);
      if (wasWaiting) {
        existing.listId = todo.id;
        existing.position = Math.max(-1, ...board.cards.filter((card) => card.listId === todo.id && card.id !== existing.id).map((card) => card.position)) + 1;
      }
      existing.updatedAt = now();
      await writeRow(TABS.cards, existing.id, workspaceId, cardValues(existing));
      const sheetLink = board.links.find((link) => link.cardId === existing.id && link.label === "Sheet ảnh chọn");
      if (sheetLink && sheetLink.url !== spreadsheetUrl) { sheetLink.url = spreadsheetUrl; sheetLink.updatedAt = now(); await writeRow(TABS.links, sheetLink.id, workspaceId, linkValues(sheetLink)); }
      if (!sheetLink) {
        const timestamp = now();
        const link: WorkflowLink = { id: randomUUID(), workspaceId, cardId: existing.id, label: "Sheet ảnh chọn", url: spreadsheetUrl, position: Math.max(-1, ...board.links.filter((link) => link.cardId === existing.id).map((link) => link.position)) + 1, createdAt: timestamp, updatedAt: timestamp };
        await writeRow(TABS.links, link.id, workspaceId, linkValues(link));
      }
      await syncCustomerChatLink(workspaceId, board.links, existing.id, album.customerChatUrl);
      await appendActivity(workspaceId, existing.id, wasWaiting ? "CARD_MOVED_FROM_WAITING_SELECTION" : "DP_SELECT_RESUBMITTED", wasWaiting ? "Khách đã gửi ảnh chọn. Thẻ đã chuyển sang “CẦN LÀM”." : "Khách đã gửi lại danh sách ảnh chọn.", "dp_select");
      return existing;
    }
    const timestamp = now();
    const cardId = `dp_${createHash("sha256").update(`${workspaceId}:${album.id}`).digest("hex").slice(0, 24)}`;
    const card: WorkflowCard = { id: cardId, workspaceId, listId: todo.id, title: text(album.title, 200) || "Album DP Select", note: "", weddingDate: "", position: Math.max(-1, ...board.cards.filter((item) => item.listId === todo.id).map((item) => item.position)) + 1, source: "dp_select", dpSelectAlbumId: album.id, dpSelectSubmissionId: selection.sessionId, selectionSubmittedAt: selection.submittedAt, createdAt: album.createdAt || timestamp, updatedAt: timestamp, completedAt: "", createdBy: "dp_select", dpSummary: dpSelectionSummary(selection) };
    await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
    try {
      const link: WorkflowLink = { id: randomUUID(), workspaceId, cardId: card.id, label: "Sheet ảnh chọn", url: spreadsheetUrl, position: 0, createdAt: timestamp, updatedAt: timestamp };
      await writeRow(TABS.links, link.id, workspaceId, linkValues(link));
      if (album.customerChatUrl) {
        const chatLink: WorkflowLink = { id: randomUUID(), workspaceId, cardId: card.id, label: "Nhóm chat khách", url: album.customerChatUrl, position: 1, createdAt: timestamp, updatedAt: timestamp };
        await writeRow(TABS.links, chatLink.id, workspaceId, linkValues(chatLink));
      }
      await appendActivity(workspaceId, card.id, "CARD_CREATED_FROM_DP_SELECT", "Thẻ được tạo tự động từ DP Select.", "dp_select");
      return card;
    } catch (error) {
      await clearRecord(TABS.cards, card.id, workspaceId);
      throw error;
    }
  });
}
