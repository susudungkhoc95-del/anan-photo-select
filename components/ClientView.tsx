"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Download, Heart, ImageOff, Send, X } from "lucide-react";
import { rpc } from "@/components/App";
import type { Draft, FolderStat, Selection } from "@/lib/types";

type AlbumPublic = {
  id: string; title: string; guide: string; maxSelect: number; largePrintLimit: number;
  tablePrintLimit: number; photoCount: number; folders: FolderStat[]; pageSize: number;
  studioSettings: { studioName: string };
};
type Photo = { id: string; name: string; folder: string; thumbUrl: string; zoomUrl: string; downloadUrl: string; viewUrl: string };
type Page = { items: Photo[]; total: number; hasMore: boolean; nextOffset: number };

export default function ClientView({ albumId }: { albumId: string }) {
  const [album, setAlbum] = useState<AlbumPublic | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [large, setLarge] = useState<Set<string>>(new Set());
  const [table, setTable] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [albumNote, setAlbumNote] = useState("");
  const [folder, setFolder] = useState("all");
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [reviewPhotos, setReviewPhotos] = useState<Photo[]>([]);
  const [reviewZoom, setReviewZoom] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const selectedRef = useRef(selected);
  const draftReady = useRef(false);
  const sessionId = useRef("");
  const nextOffsetRef = useRef(0);
  const loadingRef = useRef(false);
  const loadMoreSentinel = useRef<HTMLDivElement>(null);
  selectedRef.current = selected;

  const loadPage = useCallback(async (append: boolean, selectedFolder = folder) => {
    if (loadingRef.current) return undefined;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await rpc<Page>("getPhotoPage", { albumId, folder: selectedFolder, offset: append ? nextOffsetRef.current : 0, limit: 80 });
      setPhotos((current) => {
        if (!append) return page.items;
        const existing = new Set(current.map((photo) => photo.id));
        return [...current, ...page.items.filter((photo) => !existing.has(photo.id))];
      });
      nextOffsetRef.current = page.nextOffset;
      setTotal(page.total); setHasMore(page.hasMore);
      return page;
    } catch (e) { setError((e as Error).message); return undefined; }
    finally { loadingRef.current = false; setLoading(false); }
  }, [albumId, folder]);

  useEffect(() => {
    sessionId.current = localStorage.getItem(`anan-session-${albumId}`) || crypto.randomUUID();
    localStorage.setItem(`anan-session-${albumId}`, sessionId.current);
    Promise.all([
      rpc<AlbumPublic>("getAlbum", { albumId }),
      rpc<Draft | null>("getDraft", { albumId }),
      rpc<(Selection & { selectedFiles: Photo[] }) | null>("getSelection", { albumId })
    ]).then(([a, draft, selection]) => {
      setAlbum(a);
      const saved = draft || selection;
      if (saved) {
        setSelected(new Set(saved.selectedIds || [])); setLarge(new Set(saved.largePrintIds || []));
        setTable(new Set(saved.tablePrintIds || [])); setNotes(saved.photoNotes || {}); setAlbumNote(saved.albumNote || "");
        if (selection) setSubmitted(true);
      }
      draftReady.current = true;
      document.title = `${a.title} — ANAN Studio`;
    }).catch((e) => setError(e.message)).finally(() => loadPage(false, "all"));
  }, [albumId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sentinel = loadMoreSentinel.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !loadingRef.current) {
        loadPage(true);
      }
    }, { rootMargin: "700px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadPage]);

  useEffect(() => {
    if (zoom !== null && zoom >= photos.length - 3 && hasMore && !loadingRef.current) {
      loadPage(true);
    }
  }, [zoom, photos.length, hasMore, loadPage]);

  useEffect(() => {
    if (!draftReady.current || !album) return;
    const timer = setTimeout(() => {
      rpc("saveDraft", {
        albumId, sessionId: sessionId.current, selectedIds: [...selected], largePrintIds: [...large],
        tablePrintIds: [...table], photoNotes: notes, albumNote
      }).catch(() => {});
      localStorage.setItem(`anan-draft-${albumId}`, JSON.stringify({ selectedIds: [...selected], largePrintIds: [...large], tablePrintIds: [...table], photoNotes: notes, albumNote }));
    }, 700);
    return () => clearTimeout(timer);
  }, [album, albumId, selected, large, table, notes, albumNote]);

  function notify(text: string) { setToast(text); setTimeout(() => setToast(""), 2200); }
  function toggle(id: string) {
    setSubmitted(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setLarge((v) => { const n = new Set(v); n.delete(id); return n; });
        setTable((v) => { const n = new Set(v); n.delete(id); return n; });
      } else if (album?.maxSelect && next.size >= album.maxSelect) {
        notify(`Bạn chỉ được chọn tối đa ${album.maxSelect} ảnh.`);
      } else next.add(id);
      return next;
    });
  }
  function switchFolder(value: string) {
    setFolder(value);
    setPhotos([]);
    setHasMore(false);
    nextOffsetRef.current = 0;
    loadPage(false, value);
  }
  function setPrint(id: string, kind: "large" | "table", checked: boolean) {
    const setter = kind === "large" ? setLarge : setTable;
    const limit = kind === "large" ? album?.largePrintLimit || 0 : album?.tablePrintLimit || 0;
    setter((current) => {
      const next = new Set(current);
      if (!checked) next.delete(id);
      else if (limit && next.size >= limit) notify(`Chỉ được đánh dấu tối đa ${limit} ảnh.`);
      else next.add(id);
      return next;
    });
  }
  async function submit() {
    if (!selected.size) return notify("Bạn chưa chọn ảnh nào.");
    setSubmitting(true);
    try {
      await rpc("saveSelection", { albumId, sessionId: sessionId.current, selectedIds: [...selected], largePrintIds: [...large], tablePrintIds: [...table], photoNotes: notes, albumNote });
      localStorage.removeItem(`anan-draft-${albumId}`);
      setSubmitted(true); setReview(false); setReviewZoom(null); notify("Đã gửi danh sách ảnh thành công.");
    } catch (e) { notify((e as Error).message); }
    finally { setSubmitting(false); }
  }
  async function openReview() {
    if (!selected.size) return notify("Bạn chưa chọn ảnh nào.");
    try {
      const items = await rpc<Photo[]>("getPhotosByIds", { albumId, ids: [...selected] });
      const order = new Map([...selected].map((id, index) => [id, index]));
      setReviewPhotos(items.sort((a, b) => (order.get(a.id) || 0) - (order.get(b.id) || 0)));
      setZoom(null);
      setReviewZoom(null);
      setReview(true);
    } catch (e) { notify((e as Error).message); }
  }
  async function navigateZoom(direction: -1 | 1) {
    if (zoom === null) return;
    const next = zoom + direction;
    if (next < 0) return notify("Đây là ảnh đầu tiên.");
    if (next < photos.length) return setZoom(next);
    if (direction > 0 && hasMore) {
      const page = await loadPage(true);
      if (page?.items.length) return setZoom(next);
    }
    notify("Đây là ảnh cuối cùng.");
  }

  if (error) return <main className="client-error"><ImageOff size={36} /><h1>Không mở được album</h1><p>{error}</p></main>;
  if (!album) return <div className="page-loader"><span className="spinner" /> Đang tải album…</div>;
  const zoomPhoto = zoom === null ? null : photos[zoom];
  const selectedReviewPhotos = reviewPhotos.filter((photo) => selected.has(photo.id));
  const reviewZoomPhoto = reviewZoom === null ? null : selectedReviewPhotos[reviewZoom];

  return (
    <main className="client-page">
      <div className="studio-banner"><span>{album.studioSettings.studioName}</span></div>
      <div className="toolbar">
        <div className="toolbar-inner">
          <div className="counter">Đã chọn <span>{selected.size}</span>{album.maxSelect ? ` / ${album.maxSelect}` : ""} ảnh</div>
          <div className="row">
            <button className="secondary btn-icon" onClick={openReview}><Heart size={17} /> Xem ảnh đã chọn</button>
            <button className="btn-icon" onClick={submit} disabled={!selected.size || submitting}>{submitting ? <span className="spinner small" /> : <Check size={17} />} Gửi ảnh chọn</button>
          </div>
        </div>
      </div>
      <section className="gallery-shell shell">
        {submitted && <div className="success-banner"><Check size={19} /><span><b>Danh sách đã được gửi.</b> Bạn vẫn có thể thay đổi và gửi lại nếu cần.</span></div>}
        <div className="client-head">
          <div className="client-title"><h1>{album.title}</h1><p className="hint guide">{album.guide}</p></div>
          <button className="secondary btn-icon" onClick={() => { navigator.clipboard.writeText(location.href); notify("Đã copy link."); }}><Copy size={16} /> Copy link ảnh</button>
        </div>
        <div className="filters client-filters">
          <label>Chọn theo concept<select value={folder} onChange={(e) => switchFolder(e.target.value)}>
              <option value="all">Tất cả thư mục ({album.photoCount})</option>
              {album.folders.map((f) => <option key={f.name} value={f.name}>{f.name.split(" / ").at(-1)} ({f.count})</option>)}
            </select></label>
          <div className="hint page-status">Đang hiển thị {photos.length} / {total} ảnh</div>
        </div>
        <JustifiedGallery albumId={albumId} photos={photos} selected={selected} onOpen={setZoom} onToggle={toggle} />
        {loading && <div className="grid-loader show"><span className="spinner" /> Đang tải thêm ảnh...</div>}
        {!loading && !photos.length && <div className="empty">Chưa có ảnh để hiển thị.</div>}
        <div ref={loadMoreSentinel} className="load-more-sentinel" aria-hidden="true" />
      </section>
      {review && <Review album={album} photos={selectedReviewPhotos} selected={selected} large={large} table={table} notes={notes} albumNote={albumNote} submitting={submitting}
        onClose={() => { setReview(false); setReviewZoom(null); }} onRemove={toggle}
        onOpenPhoto={(id) => setReviewZoom(selectedReviewPhotos.findIndex((photo) => photo.id === id))}
        onPrint={setPrint} onNote={(id, value) => setNotes((n) => ({ ...n, [id]: value }))} onAlbumNote={setAlbumNote} onSubmit={submit} />}
      {zoomPhoto && <Zoom albumId={albumId} photo={zoomPhoto} previousPhoto={zoom !== null ? photos[zoom - 1] : undefined}
        nextPhoto={zoom !== null ? photos[zoom + 1] : undefined} selected={selected.has(zoomPhoto.id)}
        onToggle={() => toggle(zoomPhoto.id)} onClose={() => setZoom(null)}
        onPrev={() => navigateZoom(-1)} onNext={() => navigateZoom(1)} />}
      {reviewZoomPhoto && <Zoom albumId={albumId} photo={reviewZoomPhoto}
        previousPhoto={reviewZoom !== null ? selectedReviewPhotos[reviewZoom - 1] : undefined}
        nextPhoto={reviewZoom !== null ? selectedReviewPhotos[reviewZoom + 1] : undefined}
        selected={selected.has(reviewZoomPhoto.id)}
        onToggle={() => { toggle(reviewZoomPhoto.id); setReviewZoom(null); }}
        onClose={() => setReviewZoom(null)}
        onPrev={() => setReviewZoom((index) => index !== null && index > 0 ? index - 1 : (notify("Đây là ảnh đầu tiên."), index))}
        onNext={() => setReviewZoom((index) => index !== null && index < selectedReviewPhotos.length - 1 ? index + 1 : (notify("Đây là ảnh cuối cùng."), index))} />}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

type GalleryPhoto = { photo: Photo; index: number; ratio: number };
type GalleryRow = { items: GalleryPhoto[]; height: number };

function JustifiedGallery({ albumId, photos, selected, onOpen, onToggle }: {
  albumId: string; photos: Photo[]; selected: Set<string>; onOpen: (index: number) => void; onToggle: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setWidth(container.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => {
    if (!width) return [] as GalleryRow[];
    const gap = width <= 560 ? 4 : 6;
    const targetHeight = width <= 560 ? 145 : width <= 900 ? 185 : 225;
    const minimumHeight = width <= 560 ? 108 : 138;
    const maximumHeight = width <= 560 ? 220 : 310;
    const calculated: GalleryRow[] = [];
    let current: GalleryPhoto[] = [];
    let ratioTotal = 0;

    const finishRow = (isLast = false) => {
      if (!current.length) return;
      const naturalHeight = (width - gap * (current.length - 1)) / ratioTotal;
      calculated.push({
        items: current,
        height: isLast ? Math.min(targetHeight, naturalHeight) : Math.max(minimumHeight, Math.min(maximumHeight, naturalHeight))
      });
      current = [];
      ratioTotal = 0;
    };

    photos.forEach((photo, index) => {
      const ratio = Math.max(.42, Math.min(2.8, ratios[photo.id] || .78));
      if (current.length && (ratioTotal + ratio) * targetHeight + gap * current.length > width) finishRow();
      current.push({ photo, index, ratio });
      ratioTotal += ratio;
    });
    finishRow(true);
    return calculated;
  }, [photos, ratios, width]);

  function rememberRatio(id: string, imageWidth: number, imageHeight: number) {
    if (!imageWidth || !imageHeight) return;
    const ratio = Math.max(.42, Math.min(2.8, imageWidth / imageHeight));
    setRatios((current) => Math.abs((current[id] || 0) - ratio) < .01 ? current : { ...current, [id]: ratio });
  }

  return <div className="photo-grid photos justified-gallery" ref={containerRef}>
    {rows.map((row, rowIndex) => <div className="justified-row" key={`${row.items[0]?.photo.id || "row"}-${rowIndex}`} style={{ height: `${row.height}px` }}>
      {row.items.map(({ photo, index, ratio }) => <article
        className={`photo-card photo ${selected.has(photo.id) ? "selected" : ""}`}
        key={photo.id}
        style={{ flexGrow: ratio, flexBasis: 0 }}
        onClick={() => onOpen(index)}
      >
        <DrivePhoto albumId={albumId} photo={photo} onDimensions={(imageWidth, imageHeight) => rememberRatio(photo.id, imageWidth, imageHeight)} />
        <button className="heart" aria-label={`Chọn ${photo.name}`} onClick={(event) => { event.stopPropagation(); onToggle(photo.id); }}>{selected.has(photo.id) ? "♥" : "♡"}</button>
        <div className="caption">{photo.name}</div>
      </article>)}
    </div>)}
  </div>;
}

function Review({ album, photos, selected, large, table, notes, albumNote, submitting, onClose, onRemove, onOpenPhoto, onPrint, onNote, onAlbumNote, onSubmit }: {
  album: AlbumPublic; photos: Photo[]; selected: Set<string>; large: Set<string>; table: Set<string>; notes: Record<string, string>; albumNote: string; submitting: boolean;
  onClose: () => void; onRemove: (id: string) => void; onOpenPhoto: (id: string) => void;
  onPrint: (id: string, kind: "large" | "table", checked: boolean) => void;
  onNote: (id: string, value: string) => void; onAlbumNote: (v: string) => void; onSubmit: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  return <div className="modal-backdrop review-backdrop"><div className="review-panel panel wide-panel">
    <header><div><h2>Xem lại ảnh đã chọn</h2><p className="hint">{album.title}</p><p className="hint">Đã chọn {selected.size} ảnh · 60×90: {large.size}/{album.largePrintLimit || "∞"} · Để bàn: {table.size}/{album.tablePrintLimit || "∞"}</p></div><button className="secondary theme-toggle" onClick={onClose}><X /></button></header>
    <div className="review-grid review-list">
      {photos.map((p) => <article className="review-item" key={p.id}>
        <button className="review-photo-button" onClick={() => onOpenPhoto(p.id)} aria-label={`Xem lớn ${stripExt(p.name)}`}>
          <DrivePhoto albumId={album.id} photo={p} />
        </button>
        <div className="review-body review-meta"><strong>{stripExt(p.name)}</strong><div className="print-options review-options">
          <label className={`print-toggle ${large.has(p.id) ? "active" : ""}`}><input type="checkbox" checked={large.has(p.id)} onChange={(e) => onPrint(p.id, "large", e.target.checked)} /><span className="print-toggle-mark" /> Ảnh phóng to 60×90</label>
          <label className={`print-toggle ${table.has(p.id) ? "active" : ""}`}><input type="checkbox" checked={table.has(p.id)} onChange={(e) => onPrint(p.id, "table", e.target.checked)} /><span className="print-toggle-mark" /> Ảnh để bàn</label>
        </div><textarea className="review-note" rows={2} value={notes[p.id] || ""} onChange={(e) => onNote(p.id, e.target.value)} placeholder="Ví dụ: sửa da kỹ hơn, bỏ người phía sau..." /><button className="secondary remove-photo" onClick={() => onRemove(p.id)}>Bỏ chọn ảnh</button></div>
      </article>)}
      <div className="album-note"><label>Lưu ý chung cho toàn bộ album<textarea rows={3} value={albumNote} onChange={(e) => onAlbumNote(e.target.value)} placeholder="Nhập lưu ý chung nếu có" /></label></div>
    </div>
    <footer><button onClick={onSubmit} disabled={submitting}>{submitting ? <span className="spinner small" /> : <Send size={17} />} Gửi</button><button className="secondary" onClick={onClose}>Đóng</button></footer>
  </div></div>;
}

function Zoom({ albumId, photo, previousPhoto, nextPhoto, selected, onToggle, onClose, onPrev, onNext }: {
  albumId: string; photo: Photo; previousPhoto?: Photo; nextPhoto?: Photo; selected: boolean;
  onToggle: () => void; onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const closeRef = useRef(onClose);
  const prevRef = useRef(onPrev);
  const nextRef = useRef(onNext);
  closeRef.current = onClose;
  prevRef.current = onPrev;
  nextRef.current = onNext;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const image = () => stage.querySelector("img");
    const clamp = (value: number) => Math.max(1, Math.min(4, value));
    const apply = (animate = false) => {
      const img = image();
      if (!img) return;
      if (animate) img.style.transition = "transform 180ms ease";
      img.style.transform = `translate(${translateRef.current.x}px, ${translateRef.current.y}px) scale(${scaleRef.current})`;
      if (animate) window.setTimeout(() => { img.style.transition = ""; }, 190);
    };
    const reset = (animate = false) => {
      scaleRef.current = 1;
      translateRef.current = { x: 0, y: 0 };
      apply(animate);
    };
    const zoomAtPoint = (nextScale: number, clientX: number, clientY: number, animate = false) => {
      const img = image();
      if (!img || nextScale <= 1) return reset(animate);
      const oldScale = scaleRef.current;
      const oldTranslate = translateRef.current;
      const rect = img.getBoundingClientRect();
      const baseCenterX = rect.left + rect.width / 2 - oldTranslate.x;
      const baseCenterY = rect.top + rect.height / 2 - oldTranslate.y;
      const relativeX = clientX - baseCenterX;
      const relativeY = clientY - baseCenterY;
      const ratio = nextScale / oldScale;
      translateRef.current = {
        x: relativeX - (relativeX - oldTranslate.x) * ratio,
        y: relativeY - (relativeY - oldTranslate.y) * ratio
      };
      scaleRef.current = nextScale;
      apply(animate);
    };
    reset();

    let touchStartX = 0, touchStartY = 0, panStartX = 0, panStartY = 0;
    let panBaseX = 0, panBaseY = 0, pinchStartDistance = 0, pinchStartScale = 1;
    let isPanning = false, mousePanning = false, lastTapTime = 0, lastTapX = 0, lastTapY = 0;
    const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinchStartDistance = distance(event.touches[0], event.touches[1]);
        pinchStartScale = scaleRef.current;
        isPanning = false;
        return;
      }
      const touch = event.touches[0];
      touchStartX = panStartX = touch.clientX;
      touchStartY = panStartY = touch.clientY;
      panBaseX = translateRef.current.x;
      panBaseY = translateRef.current.y;
      isPanning = scaleRef.current > 1;
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        scaleRef.current = clamp(pinchStartScale * distance(event.touches[0], event.touches[1]) / Math.max(1, pinchStartDistance));
        if (scaleRef.current === 1) translateRef.current = { x: 0, y: 0 };
        apply();
      } else if (event.touches.length === 1 && isPanning) {
        event.preventDefault();
        translateRef.current = {
          x: panBaseX + event.touches[0].clientX - panStartX,
          y: panBaseY + event.touches[0].clientY - panStartY
        };
        apply();
      }
    };
    const touchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStartX, dy = touch.clientY - touchStartY;
      const moved = Math.max(Math.abs(dx), Math.abs(dy));
      if (moved < 22) {
        const now = Date.now();
        const isDoubleTap = now - lastTapTime < 320 && Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY) < 46;
        lastTapTime = now; lastTapX = touch.clientX; lastTapY = touch.clientY;
        if (isDoubleTap) {
          if (scaleRef.current > 1) reset(true);
          else {
            zoomAtPoint(3, touch.clientX, touch.clientY, true);
          }
          lastTapTime = 0;
          return;
        }
      }
      if (scaleRef.current > 1 || moved < 55) return;
      if (Math.abs(dx) > Math.abs(dy)) dx < 0 ? nextRef.current() : prevRef.current();
      else dy < 0 ? nextRef.current() : prevRef.current();
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const nextScale = clamp(scaleRef.current + (event.deltaY < 0 ? .18 : -.18));
      zoomAtPoint(nextScale, event.clientX, event.clientY);
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || scaleRef.current <= 1) return;
      event.preventDefault(); mousePanning = true;
      panStartX = event.clientX; panStartY = event.clientY;
      panBaseX = translateRef.current.x; panBaseY = translateRef.current.y;
      image()?.classList.add("dragging");
      stage.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!mousePanning) return;
      event.preventDefault();
      translateRef.current = { x: panBaseX + event.clientX - panStartX, y: panBaseY + event.clientY - panStartY };
      apply();
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      mousePanning = false; image()?.classList.remove("dragging");
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      else if (event.key === "ArrowLeft") { event.preventDefault(); prevRef.current(); }
      else if (event.key === "ArrowRight") { event.preventDefault(); nextRef.current(); }
    };
    stage.addEventListener("touchstart", touchStart, { passive: true });
    stage.addEventListener("touchmove", touchMove, { passive: false });
    stage.addEventListener("touchend", touchEnd, { passive: true });
    stage.addEventListener("wheel", wheel, { passive: false });
    stage.addEventListener("pointerdown", pointerDown);
    stage.addEventListener("pointermove", pointerMove);
    stage.addEventListener("pointerup", pointerUp);
    stage.addEventListener("pointercancel", pointerUp);
    window.addEventListener("keydown", key);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      stage.removeEventListener("touchstart", touchStart);
      stage.removeEventListener("touchmove", touchMove);
      stage.removeEventListener("touchend", touchEnd);
      stage.removeEventListener("wheel", wheel);
      stage.removeEventListener("pointerdown", pointerDown);
      stage.removeEventListener("pointermove", pointerMove);
      stage.removeEventListener("pointerup", pointerUp);
      stage.removeEventListener("pointercancel", pointerUp);
      window.removeEventListener("keydown", key);
      document.body.style.overflow = previousOverflow;
    };
  }, [photo.id]);

  useEffect(() => {
    [previousPhoto, nextPhoto].filter(Boolean).forEach((neighbor) => {
      [
        neighbor!.thumbUrl,
        neighbor!.zoomUrl || neighbor!.thumbUrl,
        `https://lh3.googleusercontent.com/d/${encodeURIComponent(neighbor!.id)}=w2400`
      ].forEach((source) => {
        const image = new Image();
        image.decoding = "async";
        image.src = source;
      });
    });
  }, [previousPhoto, nextPhoto]);

  return <div className="zoom-backdrop zoom-modal">
    <div className="zoom-top"><span>{stripExt(photo.name)}</span><div><a className="icon-button" href={photo.downloadUrl} target="_blank" aria-label="Tải ảnh gốc"><Download size={19} /></a><button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></div></div>
    <div className="zoom-stage" ref={stageRef}>
      <button className="zoom-nav zoom-prev prev" onClick={onPrev} aria-label="Ảnh trước"><ChevronLeft size={27} /></button>
      <DrivePhoto albumId={albumId} photo={photo} zoom />
      <button className="zoom-nav zoom-next next" onClick={onNext} aria-label="Ảnh tiếp theo"><ChevronRight size={27} /></button>
    </div>
    <div className="zoom-bottom"><button className={`zoom-select zoom-heart ${selected ? "active" : ""}`} onClick={onToggle}><Heart fill={selected ? "currentColor" : "none"} /> {selected ? "Đã chọn" : "Chọn ảnh này"}</button></div>
  </div>;
}

function stripExt(name: string) { return name.replace(/\.(jpe?g|png|webp|heic|heif|tiff?)$/i, ""); }

function DrivePhoto({ albumId, photo, zoom = false, onDimensions }: { albumId: string; photo: Photo; zoom?: boolean; onDimensions?: (width: number, height: number) => void }) {
  const sources = zoom
    ? [
        photo.thumbUrl,
        photo.zoomUrl,
        `https://lh3.googleusercontent.com/d/${encodeURIComponent(photo.id)}=w2400`,
        albumId ? `/api/image?albumId=${encodeURIComponent(albumId)}&photoId=${encodeURIComponent(photo.id)}` : photo.viewUrl
      ]
    : [
        photo.thumbUrl,
        `https://lh3.googleusercontent.com/d/${encodeURIComponent(photo.id)}=w900`,
        albumId ? `/api/image?albumId=${encodeURIComponent(albumId)}&photoId=${encodeURIComponent(photo.id)}` : photo.viewUrl
      ];
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => {
    setSourceIndex(0);
    if (!zoom) return;
    let active = true;
    let candidate = 1;
    const loadSharperSource = () => {
      if (!active || candidate >= sources.length) return;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => { if (active) setSourceIndex(candidate); };
      image.onerror = () => { candidate += 1; loadSharperSource(); };
      image.src = sources[candidate];
    };
    loadSharperSource();
    return () => { active = false; };
  }, [photo.id, zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  return <img
    className={zoom ? "zoom-image" : undefined}
    src={sources[Math.min(sourceIndex, sources.length - 1)]}
    alt={photo.name}
    loading={zoom ? "eager" : "lazy"}
    decoding="async"
    onLoad={(event) => onDimensions?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
    onError={() => setSourceIndex((index) => Math.min(index + 1, sources.length - 1))}
  />;
}
