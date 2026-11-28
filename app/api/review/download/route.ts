import { Readable } from "node:stream";
import { getGoogleApi } from "@/lib/google";
import { assertReviewPhoto, getReviewAlbum, ReviewError } from "@/lib/photo-review";

export const runtime = "nodejs";
export const maxDuration = 60;

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function attachment(filename: string) {
  const name = filename.replace(/[\x00-\x1f\x7f/\\]/g, "_").trim().toWellFormed() || "photo";
  const fallback = name.replace(/[^\x20-\x7e]|"/g, "_");
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  try {
    const album = await getReviewAlbum(query.get("albumId"));
    if (album.downloadEnabled !== true) throw new ReviewError("Album này chưa bật tải ảnh.", 403);
    const photo = await assertReviewPhoto(album.id, Number(query.get("round")), query.get("photoId") || "", false);
    const { drive } = getGoogleApi();
    const file = await drive.files.get(
      { fileId: photo.id, alt: "media", supportsAllDrives: true },
      { responseType: "stream", signal: request.signal }
    );
    return new Response(Readable.toWeb(file.data) as ReadableStream<Uint8Array>, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": attachment(photo.name)
      }
    });
  } catch (error) {
    const status = error instanceof ReviewError ? error.status : 502;
    const message = error instanceof ReviewError ? error.message : "Không tải được ảnh từ Drive. Hãy thử lại.";
    return new Response(message, { status, headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
