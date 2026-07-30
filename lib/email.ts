import type { Album } from "@/lib/types";

type SelectionEmail = {
  album: Album;
  selectedCount: number;
  largePrintCount: number;
  tablePrintCount: number;
  submittedAt: string;
  isUpdate: boolean;
  spreadsheetUrl: string;
  clientUrl: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character] || character);
}

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

/** Sends a non-blocking studio notification. Selection saving must never depend on email delivery. */
export async function sendSelectionEmail({ album, selectedCount, largePrintCount, tablePrintCount, submittedAt, isUpdate, spreadsheetUrl, clientUrl }: SelectionEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_EMAIL_FROM;
  const recipients = (process.env.NOTIFICATION_EMAIL_TO || "").split(",").map((email) => email.trim()).filter(Boolean);
  if (!apiKey || !from || !recipients.length) return { sent: false, reason: "not-configured" as const };

  const action = isUpdate ? "đã cập nhật lựa chọn ảnh" : "đã gửi lựa chọn ảnh";
  const title = escapeHtml(album.title);
  const time = vietnamTime(submittedAt);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "ANAN-DP-Select/1.0",
      "Idempotency-Key": `anan-selection-${album.id}-${submittedAt}`
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `${isUpdate ? "Cập nhật" : "Lựa chọn mới"}: ${album.title} · ${selectedCount} ảnh`,
      text: `Khách ${action}.\nAlbum: ${album.title}\nTổng số ảnh: ${selectedCount}\nẢnh phóng to 60×90: ${largePrintCount}\nẢnh để bàn: ${tablePrintCount}\nThời gian: ${time}\n\nMở Sheet kết quả: ${spreadsheetUrl}\nMở album: ${clientUrl}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#10233f"><h2 style="margin:0 0 16px">Khách ${action}</h2><p><b>Album:</b> ${title}<br><b>Tổng số ảnh:</b> ${selectedCount}<br><b>Ảnh phóng to 60×90:</b> ${largePrintCount}<br><b>Ảnh để bàn:</b> ${tablePrintCount}<br><b>Thời gian:</b> ${time}</p><p><a href="${escapeHtml(spreadsheetUrl)}" style="display:inline-block;background:#347cff;color:#fff;padding:10px 15px;border-radius:8px;text-decoration:none;font-weight:700">Mở Sheet kết quả</a></p><p style="font-size:13px;color:#66758a">Link album: <a href="${escapeHtml(clientUrl)}">${escapeHtml(clientUrl)}</a></p></div>`
    })
  });
  if (!response.ok) throw new Error(`Resend trả về lỗi ${response.status}.`);
  return { sent: true as const };
}
