"use client";

import { Copy, ExternalLink, FileSpreadsheet, KeyRound, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import AdminTabs from "@/components/AdminTabs";
import EnvironmentSwitcher from "@/components/EnvironmentSwitcher";
import PhotoReviewGallery, { folderLabel } from "@/components/PhotoReviewGallery";
import { ReviewRequestError, reviewRequest } from "@/components/photo-review-api";
import type { ReviewAlbum, ReviewRound, ReviewRoundSummary } from "@/lib/photo-review-types";

type AdminReview = { album: ReviewAlbum; round: ReviewRound; rounds: ReviewRoundSummary[] };

export default function PhotoReviewAdmin({ initialAuthenticated }: { initialAuthenticated: boolean }) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Không đăng nhập được.");
      }
      setPassword("");
      setAuthenticated(true);
    } catch (error) { setLoginError((error as Error).message); }
    finally { setLoggingIn(false); }
  }

  async function logout() {
    try {
      const response = await fetch("/api/auth", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setAuthenticated(false);
    } catch {
      setLoginError("Không đăng xuất được. Hãy thử lại.");
    }
  }

  if (!authenticated) return <main className="login-page">
    <form className="login-card" onSubmit={login}>
      <div className="login-logo"><img src="/dp-logo.png" alt="DP Select" /></div>
      <h1>Duyệt ảnh sửa</h1>
      <label>Mật khẩu quản trị<div className="input-icon"><KeyRound size={17} aria-hidden="true" />
        <input type="password" autoFocus required value={password} onChange={(event) => setPassword(event.target.value)} />
      </div></label>
      {loginError && <p className="review-error" role="alert">{loginError}</p>}
      <button disabled={loggingIn} type="submit">{loggingIn ? "Đang đăng nhập…" : "Mở trang quản trị"}</button>
    </form>
  </main>;
  return <main className="admin-page shell review-admin">
    <header className="admin-header topbar">
      <div className="admin-header-left">
        <div className="admin-logo-mark"><img src="/dp-logo.png" alt="DP Select" /></div>
        <AdminTabs active="review" />
      </div>
      <div className="topbar-actions">
        <EnvironmentSwitcher path="/review" />
        <button type="button" className="secondary theme-toggle" onClick={() => void logout()} aria-label="Đăng xuất"><LogOut size={18} /></button>
      </div>
    </header>
    {loginError && <p className="review-error" role="alert">{loginError}</p>}
    <AdminReviews onExpired={() => { setLoginError("Phiên quản trị đã hết hạn."); setAuthenticated(false); }} />
  </main>;
}

function AdminReviews({ onExpired }: { onExpired: () => void }) {
  const [albums, setAlbums] = useState<ReviewAlbum[]>([]);
  const [selected, setSelected] = useState<AdminReview | null>(null);
  const [title, setTitle] = useState("");
  const [folderUrl, setFolderUrl] = useState("");
  const [nextFolderUrl, setNextFolderUrl] = useState("");
  const [opening, setOpening] = useState(false);
  const [albumToDelete, setAlbumToDelete] = useState<ReviewAlbum | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [feedbackOnly, setFeedbackOnly] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function report(error: unknown) {
    if (error instanceof ReviewRequestError && error.status === 401) onExpired();
    else setError((error as Error).message);
  }

  useEffect(() => {
    const controller = new AbortController();
    void reviewRequest<ReviewAlbum[]>("list", {}, controller.signal).then((items) => {
      if (!controller.signal.aborted) {
        setAlbums((current) => [...new Map([...current, ...items].map((album) => [album.id, album])).values()]);
      }
    })
      .catch((error) => { if (!controller.signal.aborted) report(error); });
    return () => controller.abort();
  }, []);

  async function run(label: string, action: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(label);
    try { await action(); }
    catch (error) { report(error); }
    finally { setBusy(""); }
  }

  async function select(albumId: string, round?: number) {
    const data = await reviewRequest<AdminReview>("admin", { albumId, round });
    const current = data.rounds[0];
    setSelected(data);
    setFolder(null);
    setFeedbackOnly(Boolean(data.round.submittedAt));
    setOpening(false);
    setNextFolderUrl(current.folderUrl);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Đang đọc ảnh từ Drive…", async () => {
      const album = await reviewRequest<ReviewAlbum>("create", { title, folderUrl });
      setAlbums((current) => [album, ...current.filter((item) => item.id !== album.id)]);
      setTitle("");
      setFolderUrl("");
      await select(album.id);
      setNotice("Đã tạo link duyệt ảnh.");
    });
  }

  async function openRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    await run("Đang tải ảnh cho vòng mới…", async () => {
      const result = await reviewRequest<{ number: number }>("openRound", {
        albumId: selected.album.id, round: selected.round.number, folderUrl: nextFolderUrl
      });
      await select(selected.album.id, result.number);
      setNotice(`Đã mở vòng ${result.number}. Khách tiếp tục dùng link hiện tại.`);
    });
  }

  async function exportSheet() {
    if (!selected) return;
    await run("Đang xuất Google Sheet…", async () => {
      const result = await reviewRequest<{ url: string }>("export", {
        albumId: selected.album.id, round: selected.round.number
      });
      setSelected({ ...selected, round: { ...selected.round, sheetUrl: result.url } });
      setNotice("Đã xuất Google Sheet.");
    });
  }

  async function deleteAlbum() {
    if (!albumToDelete || busy) return;
    const albumId = albumToDelete.id;
    setAlbumToDelete(null);
    await run("Đang xóa album duyệt…", async () => {
      await reviewRequest("delete", { albumId });
      setAlbums((current) => current.filter((album) => album.id !== albumId));
      setSelected((current) => current?.album.id === albumId ? null : current);
      setNotice("Đã xóa album duyệt.");
    });
  }

  const activeRound = selected?.round;
  const clientPath = selected ? `/review/${selected.album.id}` : "";
  return <div className="review-admin-layout">
    <aside className="review-admin-sidebar">
      <section className="panel">
        <h1>Duyệt ảnh sửa</h1>
        <form className="form-stack" onSubmit={create}>
          <label>Tên album<input value={title} maxLength={150} placeholder="Dùng tên thư mục nếu để trống"
            onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Link thư mục Google Drive<input value={folderUrl} maxLength={2000} required
            placeholder="https://drive.google.com/drive/folders/…" onChange={(event) => setFolderUrl(event.target.value)} /></label>
          <button type="submit" disabled={Boolean(busy)}>Tạo link duyệt</button>
        </form>
      </section>
      <section className="panel">
        <h2>Album duyệt</h2>
        <div className="review-album-list">{albums.map((album) => <div className="review-album-row" key={album.id}>
          <button type="button" className="secondary" aria-pressed={selected?.album.id === album.id}
            disabled={Boolean(busy)} onClick={() => void run("Đang mở album…", () => select(album.id))}>{album.title}</button>
          <button type="button" className="icon-button danger review-album-delete" disabled={Boolean(busy)}
            aria-label={`Xóa album ${album.title}`} title="Xóa album" onClick={() => setAlbumToDelete(album)}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>)}</div>
        {!albums.length && <p className="hint">Chưa có album duyệt.</p>}
      </section>
    </aside>
    <section className="panel review-admin-detail">
      {busy && <p className="hint" role="status">{busy}</p>}
      {error && <p className="review-error" role="alert">{error}</p>}
      {notice && <p className="review-notice" role="status">{notice}</p>}
      {!selected || !activeRound ? <p className="hint">Chọn một album để xem ảnh và phản hồi của khách.</p> : <>
        <header className="review-admin-detail-header">
          <h2>{selected.album.title}</h2>
          <div className="review-actions">
            <button type="button" className="secondary" onClick={() => {
              void navigator.clipboard.writeText(new URL(clientPath, location.origin).href)
                .then(() => setNotice("Đã sao chép link duyệt."), () => setError("Không sao chép được link. Hãy mở trang khách và sao chép địa chỉ."));
            }}><Copy size={16} /> Sao chép link</button>
            <a href={clientPath} className="button secondary" target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mở trang khách</a>
            <button type="button" className="secondary" disabled={Boolean(busy)}
              onClick={() => void run("Đang tải phản hồi…", () => select(selected.album.id, activeRound.number))}>
              <RefreshCw size={16} /> Làm mới
            </button>
            <button type="button" className="danger" disabled={Boolean(busy)}
              onClick={() => setAlbumToDelete(selected.album)}><Trash2 size={16} aria-hidden="true" /> Xóa album</button>
          </div>
        </header>
        <div className="review-admin-controls">
          <label>Vòng duyệt<select value={activeRound.number} disabled={Boolean(busy)}
            onChange={(event) => { const number = Number(event.target.value); void run("Đang mở vòng duyệt…", () => select(selected.album.id, number)); }}>
            {selected.rounds.map((item) => <option key={item.number} value={item.number}>
              Vòng {item.number} · {item.outcome === "approved" ? "Đã duyệt" : item.submittedAt ? `${item.feedbackCount} ảnh cần sửa` : "Chờ phản hồi"}
            </option>)}
          </select></label>
          <label>Thư mục<select value={JSON.stringify(folder)}
            onChange={(event) => setFolder(JSON.parse(event.target.value) as string | null)}>
            <option value="null">Tất cả thư mục</option>
            {activeRound.folders.map(({ name, count }) => <option key={name} value={JSON.stringify(name)}>{folderLabel(name)} ({count} ảnh)</option>)}
          </select></label>
          {activeRound.submittedAt && <label>Hiển thị<select value={feedbackOnly ? "feedback" : "all"}
            onChange={(event) => setFeedbackOnly(event.target.value === "feedback")}>
            <option value="feedback">Ảnh cần sửa</option><option value="all">Tất cả ảnh</option>
          </select></label>}
        </div>
        <p className="hint">{activeRound.submittedAt ? `Khách gửi lúc ${new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh"
        }).format(new Date(activeRound.submittedAt))}` : "Đang chờ khách gửi phản hồi."}</p>
        {activeRound.submittedAt && <div className="review-actions">
          {activeRound.sheetUrl ? <a className="button secondary" href={activeRound.sheetUrl} target="_blank" rel="noreferrer">
            <FileSpreadsheet size={16} /> Mở Google Sheet
          </a> : <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void exportSheet()}>
            <FileSpreadsheet size={16} /> Xuất Google Sheet
          </button>}
          {activeRound.number === selected.rounds[0].number && <button type="button" disabled={Boolean(busy)}
            aria-expanded={opening} onClick={() => setOpening(!opening)}>Mở vòng mới</button>}
        </div>}
        {opening && <form className="form-stack review-next-round" onSubmit={openRound}>
          <label>Link thư mục Drive của vòng mới<input value={nextFolderUrl} onChange={(event) => setNextFolderUrl(event.target.value)} maxLength={2000} /></label>
          <p className="hint">Để xem lại đúng phiên bản ảnh cũ, hãy dùng thư mục mới cho vòng này và giữ các file Drive của vòng trước.</p>
          <button type="submit" disabled={Boolean(busy)}>Bắt đầu vòng {activeRound.number + 1}</button>
        </form>}
        <PhotoReviewGallery key={`${activeRound.number}:${activeRound.submittedAt}`} albumId={selected.album.id}
          round={activeRound.number} folder={folder} feedbackOnly={feedbackOnly} feedback={activeRound.feedback} admin />
      </>}
    </section>
    {albumToDelete && <dialog className="album-confirm-modal review-delete-dialog"
      ref={(dialog) => { if (dialog && !dialog.open) dialog.showModal(); }}
      role="alertdialog" aria-labelledby="review-delete-title" aria-describedby="review-delete-description"
      onClose={() => setAlbumToDelete(null)}>
      <h2 id="review-delete-title">Xóa album {albumToDelete.title}?</h2>
      <p id="review-delete-description">Các vòng duyệt và phản hồi sẽ bị xóa vĩnh viễn. Link của khách sẽ ngừng hoạt động. Ảnh và Google Sheet trên Drive vẫn được giữ.</p>
      <footer>
        <form method="dialog"><button type="submit" className="secondary" autoFocus>Hủy</button></form>
        <button type="button" className="danger" onClick={() => void deleteAlbum()}>Xóa album</button>
      </footer>
    </dialog>}
  </div>;
}
