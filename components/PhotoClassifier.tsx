"use client";

import { useState } from "react";
import { rpc } from "@/components/App";

type Group = "ANH PHONG" | "ANH DE BAN" | "ANH SUA";
type SheetRow = { name: string; group: Group };
type Source = { parent: FileSystemDirectoryHandle; file: FileSystemFileHandle; path: string };
type Item = SheetRow & { source?: Source; status: string };
type Directory = FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> };
const groups: Group[] = ["ANH PHONG", "ANH DE BAN", "ANH SUA"];
const key = (name: string) => name.replace(/\.(jpe?g)$/i, "").normalize("NFC").trim().toLowerCase();
const missing = (e: unknown) => e instanceof DOMException && e.name === "NotFoundError";

async function scan(dir: Directory, path = ""): Promise<Source[]> {
  const files: Source[] = [];
  for await (const handle of dir.values()) {
    if (handle.kind === "directory") {
      if (!groups.includes(handle.name.toUpperCase() as Group)) files.push(...await scan(handle as Directory, `${path}${handle.name}/`));
    } else if (/\.jpe?g$/i.test(handle.name)) files.push({ parent: dir, file: handle as FileSystemFileHandle, path: `${path}${handle.name}` });
  }
  return files;
}

async function exists(dir: FileSystemDirectoryHandle, name: string) {
  try { await dir.getFileHandle(name); return true; } catch (e) { if (missing(e)) return false; throw e; }
}

export default function PhotoClassifier({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  async function prepare() {
    setError(""); setItems([]); setDirectory(null); setFinished(false);
    const picker = (window as Window & { showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<Directory> }).showDirectoryPicker;
    if (!picker) { setError("Vui lòng dùng Chrome hoặc Edge trên máy tính để chọn thư mục."); return; }
    try {
      const dir = await picker({ mode: "readwrite" });
      setBusy(true);
      const rows = await rpc<SheetRow[]>("getClassifierSheet", { cardId, scope: "dp" });
      const sources = await scan(dir);
      const counts = new Map<string, number>();
      for (const row of rows) counts.set(key(row.name), (counts.get(key(row.name)) || 0) + 1);
      const result: Item[] = [];
      for (const row of rows) {
        const found = sources.filter((s) => key(s.file.name) === key(row.name));
        let status = counts.get(key(row.name))! > 1 ? "Trùng trong Sheet" : found.length > 1 ? "Trùng file nguồn" : found.length === 0 ? "Thiếu file" : "Sẵn sàng";
        if (status === "Sẵn sàng") {
          try { const target = await dir.getDirectoryHandle(row.group); if (await exists(target, found[0].file.name)) status = "Đã có file đích"; }
          catch (e) { if (!missing(e)) throw e; }
        }
        result.push({ ...row, source: found.length === 1 ? found[0] : undefined, status });
      }
      setDirectory(dir); setItems(result);
      if (!rows.length) setError("Sheet không có ảnh để phân loại.");
    } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Không thể chuẩn bị phân loại."); }
    finally { setBusy(false); }
  }
  async function run() {
    if (!directory) return;
    setBusy(true); setError("");
    const results = [...items];
    try {
      for (const group of groups) await directory.getDirectoryHandle(group, { create: true });
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        if (item.status !== "Sẵn sàng" || !item.source) continue;
        try {
          const target = await directory.getDirectoryHandle(item.group);
          if (await exists(target, item.source.file.name)) { results[i] = { ...item, status: "Đã có file đích" }; continue; }
          const original = await item.source.file.getFile();
          const destination = await target.getFileHandle(item.source.file.name, { create: true });
          const writer = await destination.createWritable();
          try { await original.stream().pipeTo(writer); } catch (e) { try { await writer.abort(); } catch {} throw e; }
          const written = await destination.getFile();
          const current = await item.source.file.getFile();
          if (written.size !== original.size || current.size !== original.size || current.lastModified !== original.lastModified) throw new Error("File thay đổi hoặc ghi chưa hoàn tất; giữ lại file nguồn");
          await item.source.parent.removeEntry(item.source.file.name);
          results[i] = { ...item, status: "Đã di chuyển" };
        } catch (e) { results[i] = { ...item, status: `Lỗi: ${e instanceof Error ? e.message : "không thể di chuyển"}` }; }
        setItems([...results]);
      }
      setFinished(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể tạo thư mục kết quả."); }
    finally { setBusy(false); setItems([...results]); }
  }
  return <section className="workflow-dp-info"><button type="button" className="secondary compact" disabled={busy} onClick={() => setOpen(!open)}>{open ? "Ẩn lọc ảnh" : "Lọc ảnh từ Sheet"}</button>{open && <div className="classifier-panel"><p>Chọn thư mục ảnh gốc trên máy. Ảnh JPG sẽ được di chuyển vào ba thư mục phân loại bên trong thư mục này.</p><button type="button" className="secondary compact" disabled={busy} onClick={() => void prepare()}>Chọn thư mục và kiểm tra</button>{directory && <p>Thư mục: {directory.name} · {items.filter((i) => i.status === "Sẵn sàng").length} sẵn sàng · {items.filter((i) => i.status !== "Sẵn sàng" && i.status !== "Đã di chuyển").length} cần kiểm tra</p>}{error && <p role="alert">{error}</p>}{busy && <p>Đang xử lý… Không đóng trang.</p>}{items.length > 0 && <div className="classifier-results"><table><thead><tr><th>Ảnh</th><th>Nhóm</th><th>Trạng thái</th></tr></thead><tbody>{items.map((item, i) => <tr key={i}><td>{item.source?.path || item.name}</td><td>{item.group}</td><td>{item.status}</td></tr>)}</tbody></table></div>}{items.some((item) => item.status === "Sẵn sàng") && !finished && <button type="button" disabled={busy} onClick={() => void run()}>Di chuyển ảnh</button>}{finished && <p>Đã xử lý xong. Kiểm tra các dòng báo lỗi hoặc bỏ qua ở trên.</p>}</div>}</section>;
}
