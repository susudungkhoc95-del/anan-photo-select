import type { Album } from "@/lib/types";

type SelectionTelegram = {
  album: Album;
  selectedCount: number;
  largePrintCount: number;
  tablePrintCount: number;
  photoNoteCount: number;
  albumNote: string;
  submittedAt: string;
  isUpdate: boolean;
  spreadsheetUrl: string;
  clientUrl: string;
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

async function sendTelegramMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: "not-configured" as const };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "ANAN-DP-Select/1.0" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  if (!response.ok) throw new Error(`Telegram trả về lỗi ${response.status}.`);
  return { sent: true as const };
}

/** Sends a non-blocking studio notification. Selection saving must never depend on Telegram delivery. */
export async function sendSelectionTelegram({ album, selectedCount, largePrintCount, tablePrintCount, photoNoteCount, albumNote, submittedAt, isUpdate, spreadsheetUrl, clientUrl }: SelectionTelegram) {
  const action = isUpdate ? "đã cập nhật lựa chọn ảnh" : "đã gửi lựa chọn ảnh";
  const noteLines = [
    albumNote ? `Lưu ý chung: ${clip(albumNote, 800)}` : "Lưu ý chung: không có",
    `Ghi chú riêng: ${photoNoteCount ? `${photoNoteCount} ảnh` : "không có"}`
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
    `Mở Sheet kết quả: ${spreadsheetUrl}`,
    `Mở album: ${clientUrl}`
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
