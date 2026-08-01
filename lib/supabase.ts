import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only client. The secret key never reaches the browser: all access is
 * performed by our authenticated Next.js route handlers.
 */
let serverClient: SupabaseClient | undefined;

export function getSupabaseServer() {
  if (serverClient) return serverClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Chưa cấu hình Supabase. Hãy kiểm tra file .env.local.");
  }
  serverClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return serverClient;
}

export const APP_RECORDS_TABLE = "app_records";

export type AppRecord = {
  collection: string;
  record_id: string;
  workspace_id: string;
  payload: unknown;
  created_at?: string;
  updated_at?: string;
};

export async function readAppRecords(collection: string, workspaceId?: string) {
  let query = getSupabaseServer()
    .from(APP_RECORDS_TABLE)
    .select("collection, record_id, workspace_id, payload, created_at, updated_at")
    .eq("collection", collection)
    .order("created_at", { ascending: true });
  if (workspaceId !== undefined) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) throw new Error(`Không đọc được dữ liệu Supabase: ${error.message}`);
  return (data || []) as AppRecord[];
}

export async function saveAppRecord(collection: string, recordId: string, payload: unknown, workspaceId = "") {
  const { error } = await getSupabaseServer().from(APP_RECORDS_TABLE).upsert({
    scope: "studio",
    collection,
    record_id: recordId,
    workspace_id: workspaceId,
    payload
  }, { onConflict: "scope,collection,record_id" });
  if (error) throw new Error(`Không lưu được dữ liệu Supabase: ${error.message}`);
}

export async function removeAppRecord(collection: string, recordId: string, workspaceId?: string) {
  let query = getSupabaseServer()
    .from(APP_RECORDS_TABLE)
    .delete()
    .eq("collection", collection)
    .eq("record_id", recordId);
  if (workspaceId !== undefined) query = query.eq("workspace_id", workspaceId);
  const { error } = await query;
  if (error) throw new Error(`Không xóa được dữ liệu Supabase: ${error.message}`);
}
