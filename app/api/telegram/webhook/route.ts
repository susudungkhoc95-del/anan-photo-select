import { NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/telegram-bot";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await handleTelegramUpdate(await request.json());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Telegram webhook error", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
