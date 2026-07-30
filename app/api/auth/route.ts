import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { adminCookie, createSessionValue, isAdmin } from "@/lib/auth";

export const runtime = "nodejs";

function sameText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET() {
  return NextResponse.json({ authenticated: await isAdmin() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || !sameText(String(body.password || ""), expected)) {
    return NextResponse.json({ error: "Mật khẩu không đúng." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie.name, createSessionValue(), adminCookie.options);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie.name, "", { ...adminCookie.options, maxAge: 0 });
  return response;
}
