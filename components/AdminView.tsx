"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive, Check, ChevronDown, Copy, ExternalLink, FolderSync, Images, KeyRound,
  Link as LinkIcon, LogOut, RotateCcw, Search, Settings, Sheet,
  Sparkles, Trash2
} from "lucide-react";
import { rpc } from "@/components/App";
import QuickLinks from "@/components/QuickLinks";
import type { Album, GuideTemplate, QuickLink, StudioSettings } from "@/lib/types";

type ListedAlbum = Album & { clientUrl: string; spreadsheetUrl: string };
type AlbumPage = { items: ListedAlbum[]; total: number; hasMore: boolean; nextOffset: number };

const initialForm = {
  title: "", folderUrl: "", rawFolderUrl: "", customerChatUrl: "", maxSelect: "0",
  largePrintLimit: "2", tablePrintLimit: "10", guide: ""
};

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

export default function AdminView() {
  const [auth, setAuth] = useState<"loading" | "yes" | "no">("loading");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [albums, setAlbums] = useState<ListedAlbum[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState("active");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectionSettingsOpen, setSelectionSettingsOpen] = useState(false);
  const [guideTemplates, setGuideTemplates] = useState<GuideTemplate[]>([]);
  const [selectedGuideTemplateId, setSelectedGuideTemplateId] = useState("");
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);

  useEffect(() => {
    document.body.classList.add("admin-mode");
    document.body.classList.remove("admin-light-mode");
    return () => document.body.classList.remove("admin-mode", "admin-light-mode");
  }, []);

  const load = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const data = await rpc<AlbumPage>("listAlbums", {
        keyword: query, sortOrder: sort, status,
        offset: append ? albums.length : 0, limit: 30
      });
      setAlbums((current) => append ? [...current, ...data.items] : data.items);
      setHasMore(data.hasMore);
    } catch (error) {
      if ((error as { status?: number }).status === 401) setAuth("no");
      else setMessage((error as Error).message);
    } finally { setLoading(false); }
  }, [albums.length, query, sort, status]);

  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then(({ authenticated }) => setAuth(authenticated ? "yes" : "no"));
  }, []);

  useEffect(() => {
    if (auth !== "yes") return;
    rpc<StudioSettings>("getSettings").then((s) => {
      setGuideTemplates(s.guideTemplates);
      setSelectedGuideTemplateId(s.defaultGuideTemplateId);
      setQuickLinks(s.quickLinks);
      setForm((f) => ({ ...f, guide: s.defaultGuide }));
    }).catch(() => {});
  }, [auth]);

  useEffect(() => {
    if (auth !== "yes") return;
    const timer = setTimeout(() => load(false), 300);
    return () => clearTimeout(timer);
  }, [auth, query, sort, status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(event: React.FormEvent) {
    event.preventDefault(); setLoginError("");
    const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return setLoginError(json.error || "Không đăng nhập được.");
    setAuth("yes");
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    setAuth("no");
  }

  async function create(event: React.FormEvent) {
    event.preventDefault(); setCreating(true); setMessage("");
    try {
      const album = await rpc<{ clientUrl: string; photoCount: number }>("createAlbum", form);
      setMessage(`Đã tạo album ${album.photoCount} ảnh. Link khách: ${album.clientUrl}`);
      await navigator.clipboard.writeText(album.clientUrl).catch(() => {});
      setForm((f) => ({ ...initialForm, guide: f.guide }));
      await load(false);
    } catch (error) { setMessage((error as Error).message); }
    finally { setCreating(false); }
  }

  async function action(name: string, albumId: string, payload: Record<string, unknown> = {}) {
    setMessage("");
    try {
      const result = await rpc<Record<string, unknown>>(name, { albumId, ...payload });
      if (name === "createRawSelectionFolder") {
        setMessage(`Đã chọn xong ${result.copied || 0} ảnh RAW.`);
        window.setTimeout(() => setMessage(""), 4000);
      } else setMessage("Đã cập nhật.");
      await load(false);
    } catch (error) { setMessage((error as Error).message); }
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }

  if (auth === "loading") return <div className="page-loader"><span className="spinner" /> Đang kiểm tra phiên…</div>;
  if (auth === "no") return (
    <main className="login-page">
      <form className="login-card" onSubmit={login}>
        <div className="login-logo"><img src="/dp-logo.png" alt="DP Select" /></div>
        <h1>DP select</h1>
        <p className="muted">Đăng nhập để tạo link chọn ảnh và xem kết quả của khách.</p>
        <label><span>Mật khẩu quản trị</span><div className="input-icon"><KeyRound size={17} /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required /></div></label>
        {loginError && <div className="notice error">{loginError}</div>}
        <button type="submit">Mở trang quản trị</button>
      </form>
    </main>
  );

  return (
    <main className="admin-page shell" id="adminView">
      <header className="admin-header topbar">
        <div className="admin-logo-mark"><img src="/dp-logo.png" alt="DP Select" /></div>
        <div className="topbar-actions">
          <button className="secondary btn-icon" onClick={() => load(false)}><RotateCcw size={17} /> <span className="full-label">Tải lại album</span><span className="short-label">Tải lại</span></button>
          <button className="secondary theme-toggle" onClick={logout} aria-label="Đăng xuất"><LogOut size={18} /></button>
        </div>
      </header>
      <nav className="app-tabs" aria-label="Khu vực quản trị"><a className="active" href="/">DP Select</a><a href="/workflow">DP Workflow</a></nav>
      <QuickLinks links={quickLinks} />
      <div className="admin-grid">
        <section className="panel create-panel">
          <div className="panel-heading"><span className="panel-icon"><Sparkles size={20} /></span><h1>Tạo trang chọn ảnh</h1></div>
          <form className="form-stack" onSubmit={create}>
            <label>Tên album<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ví dụ: Linh & Minh - 20.05.2026" /></label>
            <label>Link thư mục Drive chứa ảnh<span className="input-with-icon"><Images className="input-symbol" size={18} /><input value={form.folderUrl} onChange={(e) => setForm({ ...form, folderUrl: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" required /></span></label>
            <label>Link thư mục Drive chứa ảnh RAW<span className="input-with-icon"><Images className="input-symbol" size={18} /><input value={form.rawFolderUrl} onChange={(e) => setForm({ ...form, rawFolderUrl: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" /></span></label>
            <label>Link nhóm chat khách<span className="input-with-icon"><LinkIcon className="input-symbol" size={18} /><input value={form.customerChatUrl} onChange={(e) => setForm({ ...form, customerChatUrl: e.target.value })} placeholder="https://zalo.me/g/... hoặc https://m.me/..." /></span></label>
            <button type="button" className={`secondary selection-settings-toggle ${selectionSettingsOpen ? "open" : ""}`} onClick={() => setSelectionSettingsOpen((open) => !open)}>Thông số chọn ảnh <ChevronDown size={18} /></button>
            {selectionSettingsOpen && <div className="selection-settings-fields">
              {guideTemplates.length > 0 && <label>Mẫu hướng dẫn
                <select value={selectedGuideTemplateId} onChange={(e) => {
                  const template = guideTemplates.find((item) => item.id === e.target.value);
                  setSelectedGuideTemplateId(e.target.value);
                  if (template) setForm((current) => ({ ...current, guide: template.guide }));
                }}>
                  {guideTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
                </select>
              </label>}
              <label>Số ảnh tối đa khách được chọn<input type="number" min="0" value={form.maxSelect} onChange={(e) => setForm({ ...form, maxSelect: e.target.value })} /></label>
              <label>Số ảnh phóng to 60x90<input type="number" min="0" value={form.largePrintLimit} onChange={(e) => setForm({ ...form, largePrintLimit: e.target.value })} /></label>
              <label>Số ảnh để bàn<input type="number" min="0" value={form.tablePrintLimit} onChange={(e) => setForm({ ...form, tablePrintLimit: e.target.value })} /></label>
              <label>Hướng dẫn chọn ảnh<textarea rows={7} value={form.guide} onChange={(e) => setForm({ ...form, guide: e.target.value })} /></label>
            </div>}
            <button className="btn-icon" disabled={creating}>{creating ? <><span className="spinner small" /> Đang quét Drive…</> : <><LinkIcon size={18} /> Tạo link gửi khách</>}</button>
          </form>
        </section>

        <section className="panel library-panel">
          <div className="panel-heading"><span className="panel-icon"><Images size={20} /></span><div><h2>Album đã tạo</h2><div className="hint">Danh sách lưu trong trang tính quản lý riêng của app.</div></div></div>
          <div className="filters">
            <label>Tìm kiếm album<span className="input-with-icon"><Search className="input-symbol" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nhập tên album cần tìm" /></span></label>
            <label>Sắp xếp<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option></select></label>
            <label>Trạng thái<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Đang dùng</option><option value="archived">Đã lưu trữ</option></select></label>
          </div>
          {message && <div className="notice">{message}</div>}
          <div className="album-list">
            {!albums.length && !loading && <div className="empty-state">Chưa có album nào trong mục này.</div>}
            {albums.map((album) => <AlbumCard key={album.id} album={album} onAction={action} onNotify={notify} />)}
          </div>
          {loading && <div className="center muted"><span className="spinner small" /> Đang tải…</div>}
          {hasMore && <div className="load-more"><button className="secondary" onClick={() => load(true)}>Tải thêm album</button></div>}
        </section>
      </div>
      <button className="secondary settings-fab" onClick={() => setSettingsOpen((open) => !open)} aria-label={settingsOpen ? "Đóng cấu hình" : "Mở cấu hình"}><Settings size={19} /></button>
      {settingsOpen && <SettingsModal templates={guideTemplates} quickLinks={quickLinks} defaultTemplateId={selectedGuideTemplateId} onClose={() => setSettingsOpen(false)} onSaved={(settings) => {
        setGuideTemplates(settings.guideTemplates);
        setSelectedGuideTemplateId(settings.defaultGuideTemplateId);
        setQuickLinks(settings.quickLinks);
        setForm((f) => ({ ...f, guide: settings.defaultGuide }));
      }} />}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function AlbumCard({ album, onAction, onNotify }: { album: ListedAlbum; onAction: (name: string, id: string, payload?: Record<string, unknown>) => Promise<void>; onNotify: (message: string) => void }) {
  const [raw, setRaw] = useState(album.rawFolderUrl || "");
  const [chat, setChat] = useState(album.customerChatUrl || "");
  const [busy, setBusy] = useState("");
  const [linksOpen, setLinksOpen] = useState(false);
  const run = async (name: string, payload?: Record<string, unknown>) => {
    if ((name === "deleteAlbum" || name === "archiveAlbum") && !confirm(name === "deleteAlbum" ? "Xoá album khỏi ứng dụng? Ảnh gốc trên Drive không bị xoá." : "Lưu trữ album này?")) return;
    setBusy(name); await onAction(name, album.id, payload); setBusy("");
  };
  return (
    <article className="album-card album-item">
      <div className="album-card-top album-title-row">
        <h3>{album.title}</h3>
        <div className="submitted-status">
          <span className={`status submit-badge ${album.submittedAt ? "" : "pending"}`}>{album.submittedAt ? <><Check size={13} /> Đã gửi {album.submittedCount} ảnh</> : "Chưa gửi"}</span>
          {album.submittedAt && <span className="submitted-at">Gửi lúc {formatSubmittedAt(album.submittedAt)}</span>}
        </div>
      </div>
      <div className="album-card-footer">
        <button className={`icon-button album-expand ${linksOpen ? "open" : ""}`} onClick={() => setLinksOpen((open) => !open)} aria-label={linksOpen ? "Ẩn link album" : "Hiện link album"}><ChevronDown size={18} /></button>
      <div className="card-actions">
        <button className="secondary compact" onClick={() => { navigator.clipboard.writeText(album.clientUrl).then(() => onNotify("Đã copy link gửi khách.")).catch(() => onNotify("Không thể copy link. Hãy thử lại.")); }}><Copy size={15} /> Copy link</button>
        <a className="button secondary compact" href={album.clientUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Mở</a>
        {album.spreadsheetUrl && <a className="button secondary compact" href={album.spreadsheetUrl} target="_blank" rel="noreferrer"><Sheet size={15} /> Trang Tính</a>}
        <button className="icon-button" title={album.status === "archived" ? "Khôi phục" : "Lưu trữ"} onClick={() => run(album.status === "archived" ? "restoreAlbum" : "archiveAlbum")}><Archive size={16} /></button>
        <button className="icon-button danger" title="Xoá" onClick={() => run("deleteAlbum")}><Trash2 size={16} /></button>
      </div>
      </div>
      {linksOpen && <div className="album-link-details">
        <div className="raw-line">
          <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Link thư mục RAW" />
          <button className="secondary compact" onClick={() => run("updateRawFolder", { rawFolderUrl: raw })}>Lưu RAW</button>
          {album.rawSelectionFolderUrl ? (
            <a className="button secondary compact" href={album.rawSelectionFolderUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Link RAW chọn</a>
          ) : (
            <button className="secondary compact" disabled={!album.submittedAt || !raw || Boolean(busy)} onClick={() => run("createRawSelectionFolder")}><FolderSync size={15} /> Tạo thư mục RAW chọn</button>
          )}
        </div>
        <div className="raw-line">
          <input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Link nhóm chat khách" />
          <button className="secondary compact" onClick={() => run("updateCustomerChat", { customerChatUrl: chat })}>Lưu nhóm chat</button>
          {album.customerChatUrl && <a className="button secondary compact" href={album.customerChatUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Mở nhóm chat</a>}
        </div>
      </div>}
    </article>
  );
}

function SettingsModal({ templates: initialTemplates, quickLinks: initialQuickLinks, defaultTemplateId: initialDefaultTemplateId, onClose, onSaved }: { templates: GuideTemplate[]; quickLinks: QuickLink[]; defaultTemplateId: string; onClose: () => void; onSaved: (settings: StudioSettings) => void }) {
  const [templates, setTemplates] = useState<GuideTemplate[]>(initialTemplates.length ? initialTemplates : [{ id: "default", name: "Mẫu mặc định", guide: "" }]);
  const [selectedId, setSelectedId] = useState(initialDefaultTemplateId || initialTemplates[0]?.id || "default");
  const [defaultTemplateId, setDefaultTemplateId] = useState(initialDefaultTemplateId || initialTemplates[0]?.id || "default");
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(initialQuickLinks);
  const [busy, setBusy] = useState(false);
  const selected = templates.find((template) => template.id === selectedId) || templates[0];
  function updateSelected(patch: Partial<GuideTemplate>) {
    setTemplates((current) => current.map((template) => template.id === selected.id ? { ...template, ...patch } : template));
  }
  function addTemplate() {
    const id = `template-${Date.now()}`;
    setTemplates((current) => [...current, { id, name: `Mẫu ${current.length + 1}`, guide: selected?.guide || "" }]);
    setSelectedId(id);
  }
  function removeSelected() {
    if (templates.length === 1) return;
    const next = templates.filter((template) => template.id !== selected.id);
    setTemplates(next);
    setSelectedId(next[0].id);
    if (defaultTemplateId === selected.id) setDefaultTemplateId(next[0].id);
  }
  function addQuickLink() { setQuickLinks((current) => [...current, { id: `quick-${Date.now()}`, label: "Thư mục mới", url: "" }]); }
  function updateQuickLink(id: string, patch: Partial<QuickLink>) { setQuickLinks((current) => current.map((link) => link.id === id ? { ...link, ...patch } : link)); }
  async function save() {
    setBusy(true);
    try { const settings = await rpc<StudioSettings>("saveSettings", { guideTemplates: templates, defaultGuideTemplateId: defaultTemplateId, quickLinks }); onSaved(settings); onClose(); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card settings-modal" onMouseDown={(e) => e.stopPropagation()}>
    <p className="eyebrow">CÀI ĐẶT</p><h2>Mẫu hướng dẫn</h2><p className="muted">Lưu nhiều mẫu để chọn nhanh khi tạo album mới.</p>
    <div className="template-toolbar">
      <select value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
      <button className="secondary compact" type="button" onClick={addTemplate}>+ Mẫu mới</button>
    </div>
    <label>Tên mẫu<input value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} placeholder="Ví dụ: Gói 40 ảnh" /></label>
    <label>Hướng dẫn<textarea rows={10} value={selected.guide} onChange={(e) => updateSelected({ guide: e.target.value })} /></label>
    <div className="template-options">
      <label className="checkbox-label"><input type="radio" checked={defaultTemplateId === selected.id} onChange={() => setDefaultTemplateId(selected.id)} /> Dùng làm mẫu mặc định</label>
      {templates.length > 1 && <button className="button ghost danger-text" type="button" onClick={removeSelected}>Xoá mẫu này</button>}
    </div>
    <div className="quick-links-settings"><div><h3>Truy cập nhanh</h3><p className="muted">Các nút nhỏ chỉ hiện ở trang quản trị.</p></div>
      {quickLinks.map((link) => <div className="quick-link-edit" key={link.id}><input value={link.label} onChange={(e) => updateQuickLink(link.id, { label: e.target.value })} aria-label="Tên nút" /><input value={link.url} onChange={(e) => updateQuickLink(link.id, { url: e.target.value })} placeholder="https://drive.google.com/..." aria-label="Link nút" /><button className="button ghost danger-text" type="button" onClick={() => setQuickLinks((current) => current.filter((item) => item.id !== link.id))}>Xoá</button></div>)}
      <button className="secondary compact" type="button" onClick={addQuickLink}>+ Thêm nút</button>
    </div>
    <div className="modal-actions"><button className="button ghost" onClick={onClose}>Huỷ</button><button onClick={save} disabled={busy}>Lưu thay đổi</button></div>
  </div></div>;
}
