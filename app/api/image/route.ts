import { NextResponse } from "next/server";
import { getPhotoThumbnail } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await getPhotoThumbnail(
      url.searchParams.get("albumId") || "",
      url.searchParams.get("photoId") || ""
    );
    return new Response(result.body, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không tải được ảnh.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
