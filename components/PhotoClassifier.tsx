"use client";

import { useState } from "react";
import { rpc } from "@/components/App";

type Group = "ANH PHONG" | "ANH DE BAN" | "ANH SUA";
type SheetRow = { name: string; group: Group };
type Source = { parent: FileSystemDirectoryHandle; file: FileSystemFileHandle; path: string };
type Item = SheetRow & { source?: Source; status: string };
type NativeBridge = { postMessage(value: unknown): Promise<{ directory?: string; items: (SheetRow & { status: string; path: string })[] }> };
const nativeBridge = () => typeof window === "undefined" ? undefined : (window as Window & { webkit?: { messageHandlers?: { dpClassifier?: NativeBridge } } }).webkit?.messageHandlers?.dpClassifier;
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
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [folder, setFolder] = useState("");
  const [showResults, setShowResults] = useState(false);

  async function classify() {
    setError(""); setItems([]); setFolder(""); setShowResults(false);
    const native = nativeBridge();
    try {
      let dir: Directory | undefined;
      if (native) {
        setBusy(true);
        const chosen = await native.postMessage({ action: "choose" });
        setFolder(chosen.directory || "");
      } else {
        const picker = (window as Window & { showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<Directory> }).showDirectoryPicker;
        if (!picker) throw new Error("Vui lòng dùng ứng dụng DP Workflow mới hoặc Chrome/Edge để chọn thư mục.");
        dir = await picker({ mode: "readwrite" });
        setBusy(true);
        setFolder(dir.name);
      }
      const rows = await rpc<SheetRow[]>("getClassifierSheet", { cardId, scope: "dp" });
      if (!rows.length) throw new Error("Sheet không có ảnh để phân loại.");
      if (native) {
        const result = await native.postMessage({ action: "run", rows });
        setItems(result.items.map((item) => ({ name: item.path || item.name, group: item.group, status: item.status })));
      } else if (dir) {
        const sources = await scan(dir);
        const counts = new Map<string, number>();
        for (const row of rows) counts.set(key(row.name), (counts.get(key(row.name)) || 0) + 1);
        const results: Item[] = [];
        for (const row of rows) {
          const found = sources.filter((s) => key(s.file.name) === key(row.name));
          const status = counts.get(key(row.name))! > 1 ? "Trùng trong Sheet" : found.length > 1 ? "Trùng file nguồn" : found.length === 0 ? "Thiếu file" : "Sẵn sàng";
          results.push({ ...row, source: found.length === 1 ? found[0] : undefined, status });
        }
        for (const group of groups) await dir.getDirectoryHandle(group, { create: true });
        for (let i = 0; i < results.length; i++) {
          const item = results[i];
          if (item.status !== "Sẵn sàng" || !item.source) continue;
          try {
            const target = await dir.getDirectoryHandle(item.group);
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
        setItems(results);
      }
      setShowResults(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!(e instanceof DOMException && e.name === "AbortError") && !message.includes("Đã hủy chọn thư mục")) { setError(message); setShowResults(true); }
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" className="text-button" disabled={busy} onClick={() => void classify()}>{busy ? "Đang lọc…" : "Lọc ảnh"}</button>
    {showResults && <div className="classifier-overlay" role="dialog" aria-modal="true" aria-label="Kết quả lọc ảnh">
      <div className="classifier-report">
        <h3>Kết quả lọc ảnh</h3>
        {folder && <p>Thư mục: {folder} · Đã di chuyển: {items.filter((item) => item.status === "Đã di chuyển").length} · Bỏ qua hoặc lỗi: {items.filter((item) => item.status !== "Đã di chuyển").length}</p>}
        {error && <p role="alert">{error}</p>}
        {items.length > 0 && <div className="classifier-results"><table><thead><tr><th>Ảnh</th><th>Nhóm</th><th>Trạng thái</th></tr></thead><tbody>{items.map((item, i) => <tr key={i}><td>{item.source?.path || item.name}</td><td>{item.group}</td><td>{item.status}</td></tr>)}</tbody></table></div>}
        <button type="button" className="secondary compact" onClick={() => setShowResults(false)}>Đóng</button>
      </div>
    </div>}
  </>;
}
