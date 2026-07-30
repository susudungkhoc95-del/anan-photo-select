import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  AlbumNotFoundError,
  archiveAlbum,
  createAlbum,
  createRawSelectionFolder,
  deleteAlbum,
  getAlbum,
  getDraft,
  getSelection,
  getSettings,
  listAlbums,
  photoPage,
  photosByIds,
  saveDraft,
  saveSelection,
  saveSettings,
  updateRawFolder
} from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 300;

const adminActions = new Set([
  "createAlbum",
  "listAlbums",
  "deleteAlbum",
  "archiveAlbum",
  "restoreAlbum",
  "updateRawFolder",
  "createRawSelectionFolder",
  "getSettings",
  "saveSettings"
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "");
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    if (adminActions.has(action) && !(await isAdmin())) {
      return NextResponse.json({ error: "Phiên quản trị đã hết hạn." }, { status: 401 });
    }
    let data: unknown;
    switch (action) {
      case "createAlbum": data = await createAlbum(payload); break;
      case "getAlbum": data = await getAlbum(String(payload.albumId || "")); break;
      case "listAlbums": data = await listAlbums(payload); break;
      case "getPhotoPage": data = await photoPage(payload); break;
      case "getPhotosByIds": data = await photosByIds(payload); break;
      case "saveDraft": data = await saveDraft(payload); break;
      case "getDraft": data = await getDraft(String(payload.albumId || "")); break;
      case "saveSelection": data = await saveSelection(payload); break;
      case "getSelection": data = await getSelection(String(payload.albumId || "")); break;
      case "deleteAlbum": data = await deleteAlbum(String(payload.albumId || "")); break;
      case "archiveAlbum": data = await archiveAlbum(String(payload.albumId || "")); break;
      case "restoreAlbum": data = await archiveAlbum(String(payload.albumId || ""), true); break;
      case "updateRawFolder": data = await updateRawFolder(payload); break;
      case "createRawSelectionFolder": data = await createRawSelectionFolder(String(payload.albumId || "")); break;
      case "getSettings": data = await getSettings(); break;
      case "saveSettings": data = await saveSettings(payload); break;
      default: return NextResponse.json({ error: "Tác vụ không hợp lệ." }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Có lỗi xảy ra.";
    console.error(error);
    return NextResponse.json({ error: message }, { status: error instanceof AlbumNotFoundError ? 404 : 500 });
  }
}
