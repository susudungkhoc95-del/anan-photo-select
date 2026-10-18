import type { Album } from "@/lib/types";
import { readAppRecords, saveAppRecord } from "@/lib/supabase";

const TELEGRAM_RECIPIENTS_COLLECTION = "telegram_recipients";

type SelectionTelegram = {
  album: Album;
  selectedCount: number;
  largePrintCount: number;
  tablePrintCount: number;
  photoNoteCount: number;
  albumNote: string;
  submittedAt: string;
  isUpdate: boolean;
  isUnchanged?: boolean;
  changeSummary?: string;
  spreadsheetUrl: string;
  clientUrl: string;
  customerChatUrl?: string;
};

function vietnamTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Returns all configured recipients. TELEGRAM_CHAT_ID is kept for backwards
 * compatibility; TELEGRAM_CHAT_IDS can contain a comma/space separated list.
 */
function getConfiguredTelegramChatIds() {
  const values = [
    process.env.TELEGRAM_CHAT_ID,
    ...(process.env.TELEGRAM_CHAT_IDS || "").split(/[\s,]+/)
  ];
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

export async function getTelegramChatIds() {
  const configuredIds = getConfiguredTelegramChatIds();
  try {
    const records = await readAppRecords(TELEGRAM_RECIPIENTS_COLLECTION);
    const savedIds = records.map((record) => record.record_id).filter(Boolean);
    return [...new Set([...configuredIds, ...savedIds])];
  } catch (error) {
    // Telegram notifications should keep working with env-only configuration
    // if Supabase is unavailable or has not been configured yet.
    console.error("Không đọc được danh sách người nhận Telegram:", error);
    return configuredIds;
  }
}

export async function registerTelegramChat(chatId: string, user?: { id?: number; username?: string; first_name?: string; last_name?: string }) {
  if (!chatId) return false;
  try {
    await saveAppRecord(TELEGRAM_RECIPIENTS_COLLECTION, chatId, {
      chatId,
      user,
      registeredAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error("Không lưu được người nhận Telegram:", error);
    return false;
  }
}

export async function sendTelegramMessage(text: string, options: { chatId?: string; replyMarkup?: unknown } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = options.chatId ? [options.chatId] : await getTelegramChatIds();
  if (!token || chatIds.length === 0) return { sent: false, reason: "not-configured" as const };

  const results = await Promise.allSettled(chatIds.map(async (chatId) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "ANAN-DP-Select/1.0" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}) })
    });
    if (!response.ok) throw new Error(`Telegram trả về lỗi ${response.status} cho chat ${chatId}.`);
  }));
  const sentCount = results.filter((result) => result.status === "fulfilled").length;
  if (sentCount === 0) throw new Error("Telegram không gửi được đến bất kỳ chat nào.");
  return { sent: true as const, sentTo: sentCount, totalRecipients: chatIds.length };
}

export function sendWorkflowMoveTelegram({ title, fromList, toList, movedAt, scope }: { title: string; fromList: string; toList: string; movedAt: string; scope: "dp" | "show" }) {
  const message = [
    "🔄 Thẻ vừa được chuyển danh sách",
    `Thẻ: ${clip(title, 180)}`,
    `Từ: ${clip(fromList, 100)}`,
    `Sang: ${clip(toList, 100)}`,
    `Thời gian: ${vietnamTime(movedAt)}`
  ].filter(Boolean).join("\n");
  return sendTelegramMessage(message, {
    replyMarkup: {
      inline_keyboard: [[{ text: "📋 Xem các danh sách", callback_data: `lists:${scope}` }]]
    }
  });
}

/** Sends a non-blocking studio notification. Selection saving must never depend on Telegram delivery. */
export async function sendSelectionTelegram({ album, selectedCount, largePrintCount, tablePrintCount, photoNoteCount, albumNote, submittedAt, isUpdate, isUnchanged, changeSummary, spreadsheetUrl, clientUrl, customerChatUrl }: SelectionTelegram) {
  const action = isUnchanged ? "đã gửi lại lựa chọn ảnh (không thay đổi gì)" : isUpdate ? "đã cập nhật lựa chọn ảnh" : "đã gửi lựa chọn ảnh";
  const noteLines = [
    albumNote ? `Lưu ý chung: ${clip(albumNote, 800)}` : "Lưu ý chung: không có",
    `Ghi chú riêng: ${photoNoteCount ? `${photoNoteCount} ảnh` : "không có"}`,
    changeSummary ? `Thay đổi: ${changeSummary}` : ""
  ];
  const message = [
    `📸 Khách ${action}`,
    `Album: ${clip(album.title, 180)}`,
    `Đã chọn: ${selectedCount} ảnh`,
    `Phóng 60×90: ${largePrintCount}`,
    `Để bàn: ${tablePrintCount}`,
    ...noteLines,
    `Thời gian: ${vietnamTime(submittedAt)}`,
    "",
    `Sheet ảnh chọn: ${spreadsheetUrl}`,
    `Mở album: ${clientUrl}`,
    customerChatUrl ? `nhóm chat: ${customerChatUrl}` : ""
  ].join("\n");

  return sendTelegramMessage(message);
}

export function sendWorkflowAgeTelegram({ title, days, listName }: { title: string; days: number; listName: string }) {
  const message = [
    "⏰ Thẻ Workflow đã đến ngày 7",
    `Album/thẻ: ${clip(title, 180)}`,
    `Tuổi hiện tại: Ngày ${days}`,
    `Danh sách: ${clip(listName, 80)}`
  ].filter(Boolean).join("\n");
  return sendTelegramMessage(message);
}

export function sendWorkflowReturnDateTelegram({ title, returnDate, weddingDate, note, listName }: { title: string; returnDate: string; weddingDate?: string; note?: string; listName: string }) {
  const [year, month, day] = returnDate.split("-");
  const formattedDate = year && month && day ? `${day}/${month}/${year}` : returnDate;
  const weddingParts = weddingDate?.split("-") || [];
  const formattedWeddingDate = weddingParts.length === 3 ? `${weddingParts[2]}/${weddingParts[1]}/${weddingParts[0]}` : weddingDate;
  const message = [
    "📦 Hôm nay đến hạn trả ảnh",
    `Album/thẻ: ${clip(title, 180)}`,
    `Ngày trả ảnh: ${formattedDate}`,
    formattedWeddingDate ? `Ngày cưới: ${formattedWeddingDate}` : "",
    `Danh sách: ${clip(listName, 80)}`,
    note ? `Ghi chú: ${clip(note, 800)}` : ""
  ].filter(Boolean).join("\n");
  return sendTelegramMessage(message);
}
