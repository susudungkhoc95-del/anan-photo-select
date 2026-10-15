import { getWorkflowBoard } from "@/lib/workflow";
import { sendTelegramMessage } from "@/lib/telegram";
import type { WorkflowBoard, WorkflowCard, WorkflowList } from "@/lib/types";

type Scope = "dp" | "show";
const MAX_CARDS_IN_BUTTONS = 45;

function scopeOf(value: string | undefined): Scope { return value === "show" ? "show" : "dp"; }
function clip(value: string, max: number) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}
function formatDateTime(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
function button(text: string, callbackData: string) { return { text: clip(text, 55), callback_data: callbackData }; }
function keyboard(rows: Array<Array<{ text: string; callback_data: string }>>) { return { inline_keyboard: rows }; }
function chatIdOf(update: any): string {
  return String(update?.message?.chat?.id || update?.callback_query?.message?.chat?.id || "");
}
function isAllowed(chatId: string) { return Boolean(chatId && process.env.TELEGRAM_CHAT_ID && chatId === String(process.env.TELEGRAM_CHAT_ID)); }
function listFor(board: WorkflowBoard, listId: string) { return board.lists.find((list) => list.id === listId); }
function cardFor(board: WorkflowBoard, cardId: string) { return board.cards.find((card) => card.id === cardId); }

async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Thiếu TELEGRAM_BOT_TOKEN.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Telegram trả về lỗi ${response.status}.`);
  return response.json();
}

function listKeyboard(board: WorkflowBoard, scope: Scope) {
  return keyboard(board.lists.map((list) => [button(`${list.name} (${board.cards.filter((card) => card.listId === list.id).length})`, `list:${scope}:${list.id}`)]));
}

async function showLists(chatId: string, scope: Scope, messageId?: number) {
  const board = await getWorkflowBoard({ scope });
  const text = [`📋 ${scope === "show" ? "SHOW" : "DP WORKFLOW"}`, "Chọn một danh sách để xem các thẻ:", "", ...board.lists.map((list) => `• ${list.name}: ${board.cards.filter((card) => card.listId === list.id).length} thẻ`)].join("\n");
  const body = { chat_id: chatId, text, reply_markup: listKeyboard(board, scope), disable_web_page_preview: true };
  if (messageId) await telegramApi("editMessageText", { ...body, message_id: messageId });
  else await telegramApi("sendMessage", body);
}

async function showList(chatId: string, scope: Scope, listId: string, messageId?: number) {
  const board = await getWorkflowBoard({ scope });
  const list = listFor(board, listId);
  if (!list) return showLists(chatId, scope, messageId);
  const cards = board.cards.filter((card) => card.listId === list.id).slice(0, MAX_CARDS_IN_BUTTONS);
  const rows = cards.map((card) => [button(card.title, `card:${scope}:${card.id}`)]);
  rows.push([button("↩️ Tất cả danh sách", `lists:${scope}`)]);
  const text = [`📁 ${list.name}`, `${cards.length}${cards.length < board.cards.filter((card) => card.listId === list.id).length ? "+" : ""} thẻ — bấm vào thẻ để xem chi tiết.`].join("\n");
  const body = { chat_id: chatId, text, reply_markup: keyboard(rows), disable_web_page_preview: true };
  if (messageId) await telegramApi("editMessageText", { ...body, message_id: messageId });
  else await telegramApi("sendMessage", body);
}

async function showCard(chatId: string, scope: Scope, cardId: string, messageId?: number) {
  const board = await getWorkflowBoard({ scope });
  const card = cardFor(board, cardId);
  if (!card) return showLists(chatId, scope, messageId);
  const list = listFor(board, card.listId);
  const links = board.links.filter((link) => link.cardId === card.id);
  const lines = [`🗂 ${clip(card.title, 180)}`, `Danh sách: ${list?.name || "—"}`];
  if (card.note) lines.push(`Ghi chú: ${clip(card.note, 700)}`);
  if (card.weddingDate) lines.push(`Ngày cưới: ${formatDate(card.weddingDate)}`);
  if (card.photoReturnDate) lines.push(`Ngày trả ảnh: ${formatDate(card.photoReturnDate)}`);
  lines.push(`Tạo lúc: ${formatDateTime(card.createdAt)}`, `Cập nhật: ${formatDateTime(card.updatedAt)}`);
  const linkLines = links.map((link) => `${link.label}: ${link.url}`).join("\n");
  const text = [...lines, linkLines ? "" : "", linkLines].filter(Boolean).join("\n");
  const body = { chat_id: chatId, text, reply_markup: keyboard([[button("↩️ Danh sách hiện tại", `list:${scope}:${card.listId}`), button("📋 Tất cả danh sách", `lists:${scope}`)]]), disable_web_page_preview: true };
  if (messageId) await telegramApi("editMessageText", { ...body, message_id: messageId });
  else await telegramApi("sendMessage", body);
}

export async function handleTelegramUpdate(update: any) {
  const chatId = chatIdOf(update);
  if (!isAllowed(chatId)) return { handled: false, reason: "unauthorized" };
  const callback = update?.callback_query;
  if (callback) {
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id });
    const [type, scopeValue, id] = String(callback.data || "").split(":");
    const scope = scopeOf(scopeValue);
    const messageId = callback.message?.message_id;
    if (type === "lists") await showLists(chatId, scope, messageId);
    else if (type === "list") await showList(chatId, scope, id, messageId);
    else if (type === "card") await showCard(chatId, scope, id, messageId);
    return { handled: true };
  }
  const command = String(update?.message?.text || "").trim().split(/\s+/)[0].toLowerCase();
  if (["/start", "/lists", "/danh_sach"].includes(command)) await showLists(chatId, "dp");
  return { handled: true };
}
