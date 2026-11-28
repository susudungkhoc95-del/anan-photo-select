import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  createReviewAlbum, deleteReviewAlbum, exportReviewSheet, getReviewAdmin, getReviewAlbum, getReviewClient, listReviewAlbums,
  openReviewRound, ReviewError, reviewPhotoPage, saveReviewFeedback, setReviewDownload
} from "@/lib/photo-review";

export const runtime = "nodejs";
export const maxDuration = 300;

const adminActions = new Set(["create", "delete", "list", "admin", "adminPhotos", "openRound", "export", "setDownload"]);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.action !== "string") throw new ReviewError("Tác vụ không hợp lệ.");
    const { action, payload = {} } = body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ReviewError("Dữ liệu không hợp lệ.");
    if (adminActions.has(action) && !await isAdmin()) throw new ReviewError("Phiên quản trị đã hết hạn.", 401);
    let data: unknown;
    switch (action) {
      case "create": data = await createReviewAlbum(payload); break;
      case "delete": data = await deleteReviewAlbum(payload); break;
      case "list": data = await listReviewAlbums(); break;
      case "admin": data = await getReviewAdmin(payload); break;
      case "client": data = await getReviewClient(payload); break;
      case "downloadStatus": data = { enabled: (await getReviewAlbum(payload.albumId)).downloadEnabled === true }; break;
      case "setDownload": data = await setReviewDownload(payload); break;
      case "adminPhotos":
      case "photos": data = await reviewPhotoPage(payload, action === "adminPhotos"); break;
      case "draft":
      case "submit": data = await saveReviewFeedback(payload, action === "submit"); break;
      case "openRound": data = await openReviewRound(payload); break;
      case "export": data = await exportReviewSheet(payload); break;
      default: throw new ReviewError("Tác vụ không hợp lệ.");
    }
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Duyệt ảnh sửa", error);
    return NextResponse.json({ error: "Không thể hoàn tất thao tác. Hãy kiểm tra kết nối Drive và thử lại." }, { status: 500 });
  }
}
