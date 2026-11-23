import { isAdmin } from "@/lib/auth";
import { getDrivePhotoContent } from "@/lib/google";
import { assertReviewPhoto } from "@/lib/photo-review";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const photoId = query.get("photoId") || "";
  try {
    await assertReviewPhoto(query.get("albumId") || "", Number(query.get("round")), photoId,
      query.get("admin") === "1" && await isAdmin());
    const { body, contentType } = await getDrivePhotoContent(photoId, query.get("large") === "1" ? 2400 : 900);
    if (!contentType.startsWith("image/")) return new Response(null, { status: 404 });
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
