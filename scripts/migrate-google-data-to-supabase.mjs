/*
 * One-time, non-destructive migration from the former Google Sheets app store.
 * Run only after executing supabase/migrations/20260801_initial_schema.sql:
 *   node --env-file=.env.local scripts/migrate-google-data-to-supabase.mjs
 */
import { createHash } from "node:crypto";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const spreadsheetId = process.env.GOOGLE_DATA_SPREADSHEET_ID;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!spreadsheetId || !supabaseUrl || !supabaseKey) {
  throw new Error("Thiếu biến Google hoặc Supabase trong .env.local.");
}

function authClient() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return auth;
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
  }
  throw new Error("Chưa cấu hình tài khoản Google.");
}

const sheets = google.sheets({ version: "v4", auth: authClient() });
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });
const workspaceId = `studio_${createHash("sha256").update(spreadsheetId).digest("hex").slice(0, 20)}`;

async function values(sheetName) {
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetName.replace(/'/g, "''")}'!A2:Z` });
    return response.data.values || [];
  } catch (error) {
    // An older workbook may not have all DP Workflow tabs yet.
    if (error?.code === 400 || error?.code === 404) return [];
    throw error;
  }
}

async function save(collection, recordId, payload, workspace = "") {
  const { error } = await supabase.from("app_records").upsert({
    scope: "studio", collection, record_id: recordId, workspace_id: workspace, payload
  }, { onConflict: "scope,collection,record_id" });
  if (error) throw new Error(`${collection}/${recordId}: ${error.message}`);
}

async function migrateJsonSheet(sheetName) {
  const rows = await values(sheetName);
  let count = 0;
  for (const row of rows) {
    const [id, raw] = row;
    if (!id || !raw) continue;
    try {
      await save(sheetName, String(id), JSON.parse(String(raw)));
      count++;
    } catch (error) {
      console.warn(`Bỏ qua ${sheetName}/${id}: JSON không hợp lệ`, error.message);
    }
  }
  return count;
}

async function migrateWorkflowSheet(sheetName) {
  const rows = await values(sheetName);
  let count = 0;
  for (const row of rows) {
    if (!row[0]) continue;
    const normalized = row.map((cell) => String(cell ?? ""));
    await save(sheetName, normalized[0], normalized, normalized[1] || workspaceId);
    count++;
  }
  return count;
}

const jsonCollections = ["_albums", "_drafts", "_selections", "_settings"];
const workflowCollections = ["WorkflowLists", "WorkflowCards", "WorkflowLinks", "WorkflowActivities", "WorkflowLabels", "WorkflowCardLabels"];
let total = 0;
for (const collection of jsonCollections) {
  const count = await migrateJsonSheet(collection);
  total += count;
  console.log(`${collection}: ${count}`);
}
for (const collection of workflowCollections) {
  const count = await migrateWorkflowSheet(collection);
  total += count;
  console.log(`${collection}: ${count}`);
}
console.log(`Đã sao chép ${total} bản ghi sang Supabase. Google Sheets không bị thay đổi.`);
