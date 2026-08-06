import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const title = new URL(request.url).searchParams.get("title") || "Chọn ảnh";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "70px", background: "#eaf3ff", color: "#082042", fontSize: 64, fontWeight: 700, textAlign: "center" }}>
      {title}
    </div>,
    { width: 1200, height: 630 }
  );
}
