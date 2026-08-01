import { createHash, randomUUID } from "crypto";
import { getGoogleApi, getWorkflowWorkspaceId, quoteSheet } from "@/lib/google";
import type { Album, Selection, WorkflowActivity, WorkflowBoard, WorkflowCard, WorkflowLink, WorkflowList } from "@/lib/types";

const TABS = {
  lists: "WorkflowLists",
  cards: "WorkflowCards",
  links: "WorkflowLinks",
  activities: "WorkflowActivities"
} as const;

const HEADERS = {
  [TABS.lists]: ["id", "workspaceId", "name", "position", "systemKey", "createdAt", "updatedAt"],
  [TABS.cards]: ["id", "workspaceId", "listId", "title", "note", "position", "source", "dpSelectAlbumId", "dpSelectSubmissionId", "selectionSubmittedAt", "createdAt", "updatedAt", "completedAt", "createdBy"],
  [TABS.links]: ["id", "workspaceId", "cardId", "label", "url", "position", "createdAt", "updatedAt"],
  [TABS.activities]: ["id", "workspaceId", "cardId", "activityType", "description", "oldValue", "newValue", "actorId", "actorName", "source", "createdAt"]
} as const;

type TabName = (typeof TABS)[keyof typeof TABS];
type StoredRow = { row: number; values: string[] };

let tabsReady = false;
let tabsInitializing: Promise<void> | undefined;
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

/** Creates tabular storage once. Records are always identified by IDs, never row numbers. */
async function ensureTabs() {
  if (tabsReady) return;
  if (!tabsInitializing) {
    tabsInitializing = (async () => {
      const { sheets, spreadsheetId } = getGoogleApi();
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
      const existing = new Set((meta.data.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean));
      const requests = Object.values(TABS).filter((title) => !existing.has(title)).map((title) => ({ addSheet: { properties: { title } } }));
      if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
      await Promise.all(Object.entries(HEADERS).map(([tab, header]) =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${quoteSheet(tab)}!A1:${String.fromCharCode(64 + header.length)}1`,
          valueInputOption: "RAW",
          requestBody: { values: [[...header]] }
        })
      ));
      tabsReady = true;
    })();
  }
  await tabsInitializing;
}

async function rows(tab: TabName) {
  await ensureTabs();
  const { sheets, spreadsheetId } = getGoogleApi();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${quoteSheet(tab)}!A2:Z` });
  return (response.data.values || [])
    .map((value, index) => ({ row: index + 2, values: value.map((cell) => String(cell ?? "")) }))
    .filter((item) => item.values[0]);
}

async function writeRow(tab: TabName, id: string, workspaceId: string, values: string[]) {
  const current = await rows(tab);
  const matching = current.find((item) => item.values[0] === id && item.values[1] === workspaceId);
  const row = matching?.row || Math.max(1, ...current.map((item) => item.row)) + 1;
  const { sheets, spreadsheetId } = getGoogleApi();
  const end = String.fromCharCode(64 + values.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheet(tab)}!A${row}:${end}${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [values] }
  });
}

async function clearRecord(tab: TabName, id: string, workspaceId: string) {
  const matching = (await rows(tab)).filter((item) => item.values[0] === id && item.values[1] === workspaceId);
  if (!matching.length) return;
  const { sheets, spreadsheetId } = getGoogleApi();
  await Promise.all(matching.map((item) => sheets.spreadsheets.values.clear({ spreadsheetId, range: `${quoteSheet(tab)}!A${item.row}:Z${item.row}` })));
}

function listFrom(values: string[]): WorkflowList {
  return { id: values[0], workspaceId: values[1], name: values[2], position: position(values[3]), systemKey: values[4] as WorkflowList["systemKey"], createdAt: values[5], updatedAt: values[6] };
}
function cardFrom(values: string[]): WorkflowCard {
  return { id: values[0], workspaceId: values[1], listId: values[2], title: values[3], note: values[4], position: position(values[5]), source: values[6] === "dp_select" ? "dp_select" : "manual", dpSelectAlbumId: values[7], dpSelectSubmissionId: values[8], selectionSubmittedAt: values[9], createdAt: values[10], updatedAt: values[11], completedAt: values[12], createdBy: values[13] };
}
function linkFrom(values: string[]): WorkflowLink {
  return { id: values[0], workspaceId: values[1], cardId: values[2], label: values[3], url: values[4], position: position(values[5]), createdAt: values[6], updatedAt: values[7] };
}
function activityFrom(values: string[]): WorkflowActivity {
  return { id: values[0], workspaceId: values[1], cardId: values[2], activityType: values[3], description: values[4], oldValue: values[5], newValue: values[6], actorId: values[7], actorName: values[8], source: values[9] === "dp_select" ? "dp_select" : "manual", createdAt: values[10] };
}

function listValues(record: WorkflowList) { return [record.id, record.workspaceId, record.name, String(record.position), record.systemKey, record.createdAt, record.updatedAt]; }
function cardValues(record: WorkflowCard) { return [record.id, record.workspaceId, record.listId, record.title, record.note, String(record.position), record.source, record.dpSelectAlbumId, record.dpSelectSubmissionId, record.selectionSubmittedAt, record.createdAt, record.updatedAt, record.completedAt, record.createdBy]; }
function linkValues(record: WorkflowLink) { return [record.id, record.workspaceId, record.cardId, record.label, record.url, String(record.position), record.createdAt, record.updatedAt]; }
function activityValues(record: WorkflowActivity) { return [record.id, record.workspaceId, record.cardId, record.activityType, record.description, record.oldValue, record.newValue, record.actorId, record.actorName, record.source, record.createdAt]; }

async function readBoard(workspaceId: string): Promise<WorkflowBoard> {
  await ensureTabs();
  const { sheets, spreadsheetId } = getGoogleApi();
  const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: Object.values(TABS).map((tab) => `${quoteSheet(tab)}!A2:Z`) });
  const values = response.data.valueRanges || [];
  const scope = (index: number) => (values[index]?.values || []).map((row) => row.map((cell) => String(cell ?? ""))).filter((row) => row[1] === workspaceId);
  return {
    workspaceId,
    lists: scope(0).map(listFrom).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    cards: scope(1).map(cardFrom).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    links: scope(2).map(linkFrom).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    activities: scope(3).map(activityFrom).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
    { name: "DONE", systemKey: "DONE" }
  ];
  let nextPosition = Math.max(-1, ...board.lists.map((list) => list.position)) + 1;
  for (const item of defaults) {
    if (board.lists.some((list) => list.systemKey === item.systemKey)) continue;
    const timestamp = now();
    const list: WorkflowList = { id: randomUUID(), workspaceId, name: item.name, position: nextPosition++, systemKey: item.systemKey, createdAt: timestamp, updatedAt: timestamp };
    await writeRow(TABS.lists, list.id, workspaceId, listValues(list));
  }
}

async function boardForCurrentWorkspace() {
  const workspaceId = getWorkflowWorkspaceId();
  await ensureDefaultLists(workspaceId);
  return readBoard(workspaceId);
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
    const orderedIds = Array.isArray(payload.orderedIds) ? payload.orderedIds.map((id) => text(id, 100)) : [];
    const valid = new Set(board.lists.map((list) => list.id));
    if (orderedIds.length !== board.lists.length || orderedIds.some((id) => !valid.has(id)) || new Set(orderedIds).size !== orderedIds.length) throw new Error("Thứ tự danh sách không hợp lệ.");
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
    const card: WorkflowCard = { id: randomUUID(), workspaceId, listId: list.id, title: requiredText(payload.title, "Tên thẻ"), note: text(payload.note, 5000), position: Math.max(-1, ...board.cards.filter((item) => item.listId === list.id).map((item) => item.position)) + 1, source: "manual", dpSelectAlbumId: "", dpSelectSubmissionId: "", selectionSubmittedAt: "", createdAt: timestamp, updatedAt: timestamp, completedAt: list.systemKey === "DONE" ? timestamp : "", createdBy: "admin" };
    await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
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
    if (card.title !== title) await appendActivity(workspaceId, card.id, "CARD_TITLE_UPDATED", "Đã cập nhật tên thẻ.", "manual", card.title, title);
    if (card.note !== note) await appendActivity(workspaceId, card.id, "CARD_NOTE_UPDATED", "Đã cập nhật ghi chú.", "manual", card.note, note);
    card.title = title; card.note = note; card.updatedAt = now();
    await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
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
    await Promise.all(board.activities.filter((activity) => activity.cardId === card.id).map((activity) => clearRecord(TABS.activities, activity.id, workspaceId)));
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
    if (!todo) throw new Error("Workflow chưa có danh sách nhận thẻ tự động.");
    const matching = board.cards.filter((card) => card.dpSelectAlbumId === album.id);
    const existing = matching[0];
    if (existing) {
      existing.dpSelectSubmissionId = selection.sessionId;
      existing.selectionSubmittedAt = selection.submittedAt;
      existing.updatedAt = now();
      await writeRow(TABS.cards, existing.id, workspaceId, cardValues(existing));
      const sheetLink = board.links.find((link) => link.cardId === existing.id && link.label === "Sheet ảnh chọn");
      if (sheetLink && sheetLink.url !== spreadsheetUrl) { sheetLink.url = spreadsheetUrl; sheetLink.updatedAt = now(); await writeRow(TABS.links, sheetLink.id, workspaceId, linkValues(sheetLink)); }
      if (!sheetLink) {
        const timestamp = now();
        const link: WorkflowLink = { id: randomUUID(), workspaceId, cardId: existing.id, label: "Sheet ảnh chọn", url: spreadsheetUrl, position: 0, createdAt: timestamp, updatedAt: timestamp };
        await writeRow(TABS.links, link.id, workspaceId, linkValues(link));
      }
      await appendActivity(workspaceId, existing.id, "DP_SELECT_RESUBMITTED", "Khách đã gửi lại danh sách ảnh chọn.", "dp_select");
      return existing;
    }
    const timestamp = now();
    const cardId = `dp_${createHash("sha256").update(`${workspaceId}:${album.id}`).digest("hex").slice(0, 24)}`;
    const card: WorkflowCard = { id: cardId, workspaceId, listId: todo.id, title: text(album.title, 200) || "Album DP Select", note: "", position: Math.max(-1, ...board.cards.filter((item) => item.listId === todo.id).map((item) => item.position)) + 1, source: "dp_select", dpSelectAlbumId: album.id, dpSelectSubmissionId: selection.sessionId, selectionSubmittedAt: selection.submittedAt, createdAt: timestamp, updatedAt: timestamp, completedAt: "", createdBy: "dp_select" };
    await writeRow(TABS.cards, card.id, workspaceId, cardValues(card));
    try {
      const link: WorkflowLink = { id: randomUUID(), workspaceId, cardId: card.id, label: "Sheet ảnh chọn", url: spreadsheetUrl, position: 0, createdAt: timestamp, updatedAt: timestamp };
      await writeRow(TABS.links, link.id, workspaceId, linkValues(link));
      await appendActivity(workspaceId, card.id, "CARD_CREATED_FROM_DP_SELECT", "Thẻ được tạo tự động từ DP Select.", "dp_select");
      return card;
    } catch (error) {
      await clearRecord(TABS.cards, card.id, workspaceId);
      throw error;
    }
  });
}
