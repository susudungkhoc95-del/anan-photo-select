import { NextResponse } from "next/server";
import { notifyWorkflowAgeSeven, notifyWorkflowReturnDates } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [age, returnDates] = await Promise.all([notifyWorkflowAgeSeven(), notifyWorkflowReturnDates()]);
    return NextResponse.json({ data: { age, returnDates } });
  } catch (error) {
    console.error("Không kiểm tra được tuổi thẻ Workflow:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cron thất bại." }, { status: 500 });
  }
}
