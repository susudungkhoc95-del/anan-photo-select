"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Download, Heart, Image as ImageIcon, ImageOff, Send, X } from "lucide-react";
import { rpc } from "@/components/App";
import { resolveRestoredSelection, selectionMatchesDraft } from "@/lib/selection-state";
import type { Draft, FolderStat, Selection } from "@/lib/types";

type AlbumPublic = {
  id: string; title: string; guide: string; maxSelect: number; largePrintLimit: number;
  tablePrintLimit: number; photoCount: number; folders: FolderStat[]; pageSize: number; selectionLockState?: "processing" | "completed" | null;
  studioSettings: { studioName: string }; selectionLocked?: boolean;
};
type Photo = { id: string; name: string; folder: string; width?: number; height?: number; thumbUrl: string; thumbSrcSet?: string; zoomUrl: string; downloadUrl: string; viewUrl: string };
type Page = { items: Photo[]; total: number; hasMore: boolean; nextOffset: number };

type ImagePriority = "high" | "low";
type ImageCacheEntry = { promise: Promise<boolean>; priority: ImagePriority };
const imageCache = new Map<string, ImageCacheEntry>();
const maxCachedImages = 48;

function sizedDriveUrl(id: string, width: number) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;
}

function preloadImage(src: string, priority: ImagePriority): Promise<boolean> {
  if (!src) return Promise.resolve(false);
  const existing = imageCache.get(src);
  if (existing && (existing.priority === "high" || priority === "low")) return existing.promise;

  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = priority;
  const promise = new Promise<boolean>((resolve) => {
    image.onload = async () => {
      try { await image.decode(); } catch { /* The browser may already have decoded it. */ }
      resolve(true);
    };
    image.onerror = () => resolve(false);
    image.src = src;
  });
  imageCache.set(src, { promise, priority });
  while (imageCache.size > maxCachedImages) imageCache.delete(imageCache.keys().next().value as string);
  return promise;
}

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
  const zoomIndexRef = useRef<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendAnimation, setSendAnimation] = useState<"idle" | "sending" | "success">("idle");
  const [toast, setToast] = useState("");
  const selectedRef = useRef(selected);
  const draftReady = useRef(false);
  const sessionId = useRef("");
  const nextOffsetRef = useRef(0);
  const loadingRef = useRef(false);
  const photoRequestIdRef = useRef(0);
  const photoAbortRef = useRef<AbortController | null>(null);
  const flightTimerRef = useRef<number | null>(null);
  const loadMoreSentinel = useRef<HTMLDivElement>(null);
  selectedRef.current = selected;

  const loadPage = useCallback(async (append: boolean, selectedFolder = folder) => {
    if (loadingRef.current) return undefined;
    const requestId = ++photoRequestIdRef.current;
    const controller = new AbortController();
    photoAbortRef.current = controller;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await rpc<Page>("getPhotoPage", { albumId, folder: selectedFolder, offset: append ? nextOffsetRef.current : 0, limit: 80 }, controller.signal);
      if (requestId !== photoRequestIdRef.current) return undefined;
      setPhotos((current) => {
        if (!append) return page.items;
        const existing = new Set(current.map((photo) => photo.id));
        return [...current, ...page.items.filter((photo) => !existing.has(photo.id))];
      });
      nextOffsetRef.current = page.nextOffset;
      setTotal(page.total); setHasMore(page.hasMore);
      return page;
    } catch (e) {
      if (requestId === photoRequestIdRef.current && (e as Error).name !== "AbortError") setError((e as Error).message);
      return undefined;
    } finally {
      if (requestId === photoRequestIdRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [albumId, folder]);

  useEffect(() => {
    sessionId.current = localStorage.getItem(`anan-session-${albumId}`) || crypto.randomUUID();
    localStorage.setItem(`anan-session-${albumId}`, sessionId.current);
    // Start the album and gallery immediately. Draft/selection restoration is
    // independent and must not block the first photos from appearing.
    const refreshAlbum = () => rpc<AlbumPublic>("getAlbum", { albumId })
      .then((a) => {
        setAlbum(a);
        document.title = `${a.title} — ANAN Studio`;
      })
      .catch((e) => setError(e.message));
    void refreshAlbum();
    const lockTimer = window.setInterval(refreshAlbum, 15_000);

    void loadPage(false, "all");

    void Promise.all([
      rpc<Draft | null>("getDraft", { albumId }),
      rpc<(Selection & { selectedFiles: Photo[] }) | null>("getSelection", { albumId })
    ]).then(([draft, selection]) => {
      const restored = resolveRestoredSelection(draft, selection);
      const saved = restored.saved;
      if (saved) {
        setSelected(new Set(saved.selectedIds || [])); setLarge(new Set(saved.largePrintIds || []));
        setTable(new Set(saved.tablePrintIds || [])); setNotes(saved.photoNotes || {}); setAlbumNote(saved.albumNote || "");
      }
      setSubmitted(Boolean(selection));
      setSubmittedCount(selection?.selectedIds?.length || 0);
      setHasPendingChanges(Boolean(selection && restored.source === "draft" && draft && !selectionMatchesDraft(selection, draft)));
      // Do not let the autosave effect run before the server state is restored.
      draftReady.current = true;
    }).catch((e) => setError(e.message));
    return () => window.clearInterval(lockTimer);
  }, [albumId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sentinel = loadMoreSentinel.current;
    if (!sentinel || !hasMore) return;

    // Load the next API page before the user reaches the end. Previously each
    // 80-photo response was rendered in two 40-photo steps. Expanding the
    // second half moved the sentinel far below the current viewport, so the
    // same scroll gesture never requested offset 80 and the gallery appeared
    // to stop there.
    const requestNextPage = () => {
      if (loadingRef.current) return;
      // Different browsers (and the mobile WebView) may report the active
      // scroll position on `body`, `documentElement`, or `window`. Read all
      // of them so pagination does not depend on one scrolling implementation.
      const scrollTop = Math.max(
        window.scrollY || 0,
        document.documentElement?.scrollTop || 0,
        document.body?.scrollTop || 0,
      );
      const scrollHeight = Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
      );
      const scrollBottom = scrollTop + window.innerHeight;
      const nearPageEnd = scrollHeight - scrollBottom <= 1600;
      const nearSentinel = sentinel.getBoundingClientRect().top <= window.innerHeight + 1200;
      if (nearPageEnd || nearSentinel) void loadPage(true);
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) requestNextPage();
    }, { rootMargin: "1200px 0px" });
    observer?.observe(sentinel);
    // Drive image dimensions are resolved progressively. That changes the
    // document height without a scroll event, so observe the gallery itself
    // and re-run the same check whenever rows grow or shrink.
    const gallery = sentinel.parentElement;
    const resizeObserver = gallery && typeof ResizeObserver !== "undefined" ? new ResizeObserver(requestNextPage) : null;
    if (resizeObserver && gallery) resizeObserver.observe(gallery);
    window.addEventListener("scroll", requestNextPage, { passive: true });
    window.addEventListener("resize", requestNextPage);
    // A few embedded/mobile browsers do not dispatch a bubbling scroll event
    // and do not expose IntersectionObserver. Polling only while more data is
    // available is cheap, and guarantees the next page is requested once the
    // sentinel enters view (or the page reaches its end).
    const fallbackTimer = window.setInterval(requestNextPage, 500);
    const frame = window.requestAnimationFrame(requestNextPage);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(fallbackTimer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", requestNextPage);
      window.removeEventListener("resize", requestNextPage);
    };
  // Recheck after every completed page because images can change the document
  // height without producing another scroll event.
  }, [hasMore, loadPage, loading, photos.length]);

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
  function lockedMessage(action: "change" | "resend") {
    return album?.selectionLockState === "completed"
      ? `Album đã hoàn tất hậu kỳ, bạn không thể ${action === "change" ? "thay đổi" : "gửi lại"} ảnh chọn.`
      : `Album đang trong quá trình hậu kỳ, bạn không thể ${action === "change" ? "thay đổi" : "gửi lại"} ảnh chọn.`;
  }
  function toggle(id: string) {
    if (album?.selectionLocked) return notify(lockedMessage("change"));
    if (submitted) setHasPendingChanges(true);
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
    photoAbortRef.current?.abort();
    photoRequestIdRef.current += 1;
    loadingRef.current = false;
    setFolder(value);
    setPhotos([]);
    setHasMore(false);
    nextOffsetRef.current = 0;
    loadPage(false, value);
  }

  function setPrint(id: string, kind: "large" | "table", checked: boolean) {
    if (album?.selectionLocked) return notify(lockedMessage("change"));
    if (submitted) setHasPendingChanges(true);
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
    if (album?.selectionLocked) return notify(lockedMessage("resend"));
    if (!selected.size) return notify("Bạn chưa chọn ảnh nào.");
    const selectedIds = [...selected];
    const selectedCount = selectedIds.length;
    setSendAnimation("sending");
    setSubmitting(true);
    try {
      await rpc("saveSelection", { albumId, sessionId: sessionId.current, selectedIds, largePrintIds: [...large], tablePrintIds: [...table], photoNotes: notes, albumNote });
      localStorage.removeItem(`anan-draft-${albumId}`);
      setSubmitted(true); setSubmittedCount(selectedCount); setHasPendingChanges(false); setReview(false); setReviewZoom(null);
      setSendAnimation("success");
      if (flightTimerRef.current !== null) window.clearTimeout(flightTimerRef.current);
      flightTimerRef.current = window.setTimeout(() => setSendAnimation("idle"), 4400);
    } catch (e) {
      setSendAnimation("idle");
      notify(`Không thể gửi ${selectedCount} ảnh. ${(e as Error).message}`);
    } finally { setSubmitting(false); }
  }
  async function openReview() {
    if (!selected.size) return notify("Bạn chưa chọn ảnh nào.");
    try {
      const items = await rpc<Photo[]>("getPhotosByIds", { albumId, ids: [...selected] });
      const order = new Map([...selected].map((id, index) => [id, index]));
      setReviewPhotos(items.sort((a, b) => (order.get(a.id) || 0) - (order.get(b.id) || 0)));
      zoomIndexRef.current = null;
      setZoom(null);
      setReviewZoom(null);
      setReview(true);
    } catch (e) { notify((e as Error).message); }
  }
  async function navigateZoom(direction: -1 | 1) {
    const current = zoomIndexRef.current ?? zoom;
    if (current === null) return;
    const next = current + direction;
    if (next < 0) return notify("Đây là ảnh đầu tiên.");
    if (next < photos.length) {
      zoomIndexRef.current = next;
      return setZoom(next);
    }
    if (direction > 0 && hasMore) {
      const page = await loadPage(true);
      if (page?.items.length) {
        zoomIndexRef.current = next;
        return setZoom(next);
      }
    }
    notify("Đây là ảnh cuối cùng.");
  }

  if (error) return <main className="client-page client-error"><ImageOff size={36} /><h1>Không mở được album</h1><p>{error}</p></main>;
  if (!album) return <div className="page-loader client-page-loader"><span className="spinner" /> Đang tải album…</div>;
  const zoomPhoto = zoom === null ? null : photos[zoom];
  const selectedReviewPhotos = reviewPhotos.filter((photo) => selected.has(photo.id));
  const reviewZoomPhoto = reviewZoom === null ? null : selectedReviewPhotos[reviewZoom];
  return (
    <main className="client-page">
      <div className="studio-banner"><span>{album.studioSettings.studioName}</span></div>
      <div className="toolbar">
        <div className="toolbar-inner">
          <label className="toolbar-concept"><span>Chọn theo concept</span><select value={folder} onChange={(e) => switchFolder(e.target.value)}>
            <option value="all">Tất cả thư mục ({album.photoCount} ảnh)</option>
            {album.folders.map((f) => <option key={f.name} value={f.name}>{f.name.split(" / ").at(-1)} ({f.count} ảnh)</option>)}
          </select></label>
          <div className="client-toolbar-actions">
            <div className="counter">Đã chọn <span>{selected.size}</span>{album.maxSelect ? ` / ${album.maxSelect}` : ""} ảnh</div>
            <div className="row">
              <button className="btn-icon review-send-entry" onClick={openReview}>Xem và gửi ảnh chọn</button>
            </div>
          </div>
        </div>
      </div>
      <section className="gallery-shell shell">
        {submitted && sendAnimation === "idle" && <div className="success-banner"><span>{album.selectionLockState === "completed" ? `Đã hoàn tất hậu kỳ ${submittedCount} ảnh. Album chọn ảnh này tồn tại khoảng 2 tháng, quý khách có thể lưu ảnh gốc về trong khoảng thời gian này.` : <><b>Đã gửi {submittedCount} ảnh.</b> {album.selectionLocked ? "Album đang trong quá trình hậu kỳ." : hasPendingChanges ? `Bạn đang có thay đổi chưa gửi (${selected.size} ảnh đang chọn).` : "Bạn vẫn có thể thay đổi và gửi lại nếu cần."}</>}</span></div>}
        <div className="client-head">
          <div className="client-title"><h1>{album.title}</h1><p className="hint guide">{album.guide}</p></div>
          <button className="secondary btn-icon" onClick={() => { navigator.clipboard.writeText(location.href); notify("Đã copy link."); }}><Copy size={16} /> Copy link ảnh</button>
        </div>
        <div className="hint page-status">Đang hiển thị {photos.length} / {total} ảnh</div>
        {album.selectionLocked && <div className="selection-locked-banner" role="status">{album.selectionLockState === "completed" ? "Đã hoàn tất hậu kỳ. Ảnh chọn đã được chốt và khóa." : "Album đang trong quá trình hậu kỳ. Ảnh chọn đã được khóa tạm thời."}</div>}
        <JustifiedGallery albumId={albumId} photos={photos} selected={selected} locked={Boolean(album.selectionLocked)} onOpen={(index) => { zoomIndexRef.current = index; setZoom(index); }} onToggle={toggle} />
        {loading && <div className="grid-loader show"><span className="spinner" /> Đang tải thêm ảnh...</div>}
        {!loading && hasMore && <div className="load-more-action">
          <button className="secondary btn-icon" type="button" onClick={() => void loadPage(true)}>
            Tải thêm ảnh
          </button>
        </div>}
        {!loading && !photos.length && <div className="empty">Chưa có ảnh để hiển thị.</div>}
        <div ref={loadMoreSentinel} className="load-more-sentinel" aria-hidden="true" />
      </section>
      {review && <Review album={album} photos={selectedReviewPhotos} selected={selected} large={large} table={table} notes={notes} albumNote={albumNote} submitting={submitting} locked={Boolean(album.selectionLocked)}
        onClose={() => { setReview(false); setReviewZoom(null); }} onRemove={toggle}
        onOpenPhoto={(id) => setReviewZoom(selectedReviewPhotos.findIndex((photo) => photo.id === id))}
        onPrint={setPrint} onNote={(id, value) => { if (submitted) setHasPendingChanges(true); setNotes((n) => ({ ...n, [id]: value })); }}
        onAlbumNote={(value) => { if (submitted) setHasPendingChanges(true); setAlbumNote(value); }} onSubmit={submit} />}
      {zoomPhoto && <Zoom albumId={albumId} photo={zoomPhoto} previousPhoto={zoom !== null ? photos[zoom - 1] : undefined}
        nextPhoto={zoom !== null ? photos[zoom + 1] : undefined}
        prefetchPhotos={zoom !== null ? [photos[zoom + 1], photos[zoom + 2], photos[zoom - 1]].filter(Boolean) : []}
        selected={selected.has(zoomPhoto.id)}
        onToggle={() => toggle(zoomPhoto.id)} locked={Boolean(album.selectionLocked)} onClose={() => { zoomIndexRef.current = null; setZoom(null); }}
        onPrev={() => navigateZoom(-1)} onNext={() => navigateZoom(1)} />}
      {reviewZoomPhoto && <Zoom albumId={albumId} photo={reviewZoomPhoto}
        previousPhoto={reviewZoom !== null ? selectedReviewPhotos[reviewZoom - 1] : undefined}
        nextPhoto={reviewZoom !== null ? selectedReviewPhotos[reviewZoom + 1] : undefined}
        prefetchPhotos={reviewZoom !== null ? [selectedReviewPhotos[reviewZoom + 1], selectedReviewPhotos[reviewZoom + 2], selectedReviewPhotos[reviewZoom - 1]].filter(Boolean) : []}
        selected={selected.has(reviewZoomPhoto.id)}
        onToggle={() => { toggle(reviewZoomPhoto.id); setReviewZoom(null); }} locked={Boolean(album.selectionLocked)}
        onClose={() => setReviewZoom(null)}
        onPrev={() => setReviewZoom((index) => index !== null && index > 0 ? index - 1 : (notify("Đây là ảnh đầu tiên."), index))}
        onNext={() => setReviewZoom((index) => index !== null && index < selectedReviewPhotos.length - 1 ? index + 1 : (notify("Đây là ảnh cuối cùng."), index))} />}
      {toast && <div className="toast">{toast}</div>}
      {sendAnimation !== "idle" && <SendFlightAnimation count={selected.size} state={sendAnimation} />}
    </main>
  );
}

type GalleryPhoto = { photo: Photo; index: number; ratio: number };
type GalleryRow = { items: GalleryPhoto[]; height: number };

function JustifiedGallery({ albumId, photos, selected, locked, onOpen, onToggle }: {
  albumId: string; photos: Photo[]; selected: Set<string>; locked: boolean; onOpen: (index: number) => void; onToggle: (id: string) => void;
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
    const isMobile = width <= 560;
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
      const metadataRatio = photo.width && photo.height ? photo.width / photo.height : 0;
      const ratio = Math.max(.42, Math.min(2.8, ratios[photo.id] || metadataRatio || .78));
      if (isMobile) {
        // Mobile keeps two photos per row so portrait images remain easy to inspect.
        if (current.length === 2) finishRow();
      } else if (current.length && (ratioTotal + ratio) * targetHeight + gap * current.length > width) {
        finishRow();
      }
      current.push({ photo, index, ratio });
      ratioTotal += ratio;
      if (isMobile && current.length === 2) finishRow();
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
        <DrivePhoto
          albumId={albumId}
          photo={photo}
          onDimensions={photo.width && photo.height ? undefined : (imageWidth, imageHeight) => rememberRatio(photo.id, imageWidth, imageHeight)}
        />
        <button className="heart" disabled={locked} aria-label={`Chọn ${photo.name}`} onClick={(event) => { event.stopPropagation(); onToggle(photo.id); }}>{selected.has(photo.id) ? "♥" : "♡"}</button>
        <div className="caption">{photo.name}</div>
      </article>)}
    </div>)}
  </div>;
}

function Review({ album, photos, selected, large, table, notes, albumNote, submitting, locked, onClose, onRemove, onOpenPhoto, onPrint, onNote, onAlbumNote, onSubmit }: {
  album: AlbumPublic; photos: Photo[]; selected: Set<string>; large: Set<string>; table: Set<string>; notes: Record<string, string>; albumNote: string; submitting: boolean; locked: boolean;
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
          <label className={`print-toggle ${large.has(p.id) ? "active" : ""}`}><input type="checkbox" disabled={locked} checked={large.has(p.id)} onChange={(e) => onPrint(p.id, "large", e.target.checked)} /><span className="print-toggle-mark" /> Ảnh phóng to 60×90</label>
          <label className={`print-toggle ${table.has(p.id) ? "active" : ""}`}><input type="checkbox" disabled={locked} checked={table.has(p.id)} onChange={(e) => onPrint(p.id, "table", e.target.checked)} /><span className="print-toggle-mark" /> Ảnh để bàn</label>
        </div><textarea className="review-note" rows={2} disabled={locked} value={notes[p.id] || ""} onChange={(e) => onNote(p.id, e.target.value)} placeholder="Ví dụ: sửa da kỹ hơn, bỏ người phía sau..." /><button className="secondary remove-photo" disabled={locked} onClick={() => onRemove(p.id)}>Bỏ chọn ảnh</button></div>
      </article>)}
      <div className="album-note"><label>Lưu ý chung cho toàn bộ album<textarea rows={3} disabled={locked} value={albumNote} onChange={(e) => onAlbumNote(e.target.value)} placeholder="Nhập lưu ý chung nếu có" /></label></div>
    </div>
    <footer><button onClick={onSubmit} disabled={locked || submitting}>{submitting ? <span className="spinner small" /> : <Send size={17} />} Gửi {selected.size} ảnh</button><button className="secondary" onClick={onClose}>Đóng</button></footer>
  </div></div>;
}

function Zoom({ albumId, photo, previousPhoto, nextPhoto, prefetchPhotos, selected, locked = false, onToggle, onClose, onPrev, onNext }: {
  albumId: string; photo: Photo; previousPhoto?: Photo; nextPhoto?: Photo; selected: boolean;
  locked?: boolean;
  prefetchPhotos?: Photo[];
  onToggle: () => void; onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const closeRef = useRef(onClose);
  const prevRef = useRef(onPrev);
  const nextRef = useRef(onNext);
  const prefetchRefs = useRef<HTMLImageElement[]>([]);
  const prefetchKey = (prefetchPhotos || []).map((neighbor) => neighbor.id).join(",");
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
    prefetchRefs.current.forEach((image) => image.removeAttribute("src"));
    prefetchRefs.current = [];
    const neighbors = [...(prefetchPhotos || []), nextPhoto].filter((neighbor): neighbor is Photo => Boolean(neighbor));
    const uniqueNeighbors = [...new Map(neighbors.map((neighbor) => [neighbor.id, neighbor])).values()];
    const timers = uniqueNeighbors.slice(0, 3).map((neighbor, index) => window.setTimeout(() => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = sizedDriveUrl(neighbor.id, 1800);
      prefetchRefs.current.push(image);
    }, index * 60));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      prefetchRefs.current.forEach((image) => image.removeAttribute("src"));
      prefetchRefs.current = [];
    };
  }, [nextPhoto?.id, prefetchKey]);

  return <div className="zoom-backdrop zoom-modal">
    <div className="zoom-top"><span>{stripExt(photo.name)}</span><div><a className="icon-button" href={photo.downloadUrl} target="_blank" aria-label="Tải ảnh gốc"><Download size={19} /></a><button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></div></div>
    <div className="zoom-stage" ref={stageRef}>
      <button className="zoom-nav zoom-prev prev" onClick={onPrev} aria-label="Ảnh trước"><ChevronLeft size={27} /></button>
      <DrivePhoto key={photo.id} albumId={albumId} photo={photo} zoom />
      <button className="zoom-nav zoom-next next" onClick={onNext} aria-label="Ảnh tiếp theo"><ChevronRight size={27} /></button>
    </div>
    <div className="zoom-bottom"><button disabled={locked} className={`zoom-select zoom-heart ${selected ? "active" : ""}`} onClick={onToggle}><Heart fill={selected ? "currentColor" : "none"} /> {locked ? "Đã khóa" : selected ? "Đã chọn" : "Chọn ảnh này"}</button></div>
  </div>;
}

function stripExt(name: string) { return name.replace(/\.(jpe?g|png|webp|heic|heif|tiff?)$/i, ""); }

function SendFlightAnimation({ count, state }: { count: number; state: "sending" | "success" }) {
  return <div className={`send-flight-overlay ${state}`} role="status" aria-live="polite">
    <div className="send-flight-stage">
      <div className="send-flight-lines" aria-hidden="true"><i /><i /><i /></div>
      {[1, 2, 3].map((index) => <div key={index} className={`send-flight-photo photo-${index}`} aria-hidden="true"><ImageIcon size={28} strokeWidth={1.6} /></div>)}
      <div className="send-flight-plane" aria-hidden="true"><Send size={56} /></div>
      <p>{state === "sending" ? `Đang gửi ${count} ảnh…` : `Đã gửi ${count} ảnh`}</p>
    </div>
  </div>;
}

function DrivePhoto({ albumId, photo, zoom = false, onDimensions }: { albumId: string; photo: Photo; zoom?: boolean; onDimensions?: (width: number, height: number) => void }) {
  const sources = zoom
    ? [
        photo.thumbUrl,
        sizedDriveUrl(photo.id, 1800),
        photo.zoomUrl,
        albumId ? `/api/image?albumId=${encodeURIComponent(albumId)}&photoId=${encodeURIComponent(photo.id)}` : photo.viewUrl
      ]
    : [
        photo.thumbUrl,
        `https://lh3.googleusercontent.com/d/${encodeURIComponent(photo.id)}=w900`,
        albumId ? `/api/image?albumId=${encodeURIComponent(albumId)}&photoId=${encodeURIComponent(photo.id)}` : photo.viewUrl
      ];
  const [sourceIndex, setSourceIndex] = useState(0);
  const sharperImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    setSourceIndex(0);
    if (!zoom) return;
    let active = true;
    let candidate = 1;
    sharperImageRef.current?.removeAttribute("src");
    const loadSharperSource = async () => {
      while (active && candidate < sources.length) {
        const currentCandidate = candidate++;
        const sourceLoaded = await preloadImage(sources[currentCandidate], "high");
        if (active && sourceLoaded) setSourceIndex(currentCandidate);
        if (sourceLoaded && currentCandidate >= 2) return;
      }
    };
    loadSharperSource();
    return () => {
      active = false;
      sharperImageRef.current?.removeAttribute("src");
      sharperImageRef.current = null;
    };
  }, [photo.id, zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  return <img
    className={zoom ? "zoom-image" : undefined}
    src={sources[Math.min(sourceIndex, sources.length - 1)]}
    srcSet={!zoom ? photo.thumbSrcSet : undefined}
    sizes={zoom ? "100vw" : "(max-width: 560px) 50vw, (max-width: 1000px) 33vw, 25vw"}
    alt={photo.name}
    loading={zoom ? "eager" : "lazy"}
    fetchPriority={zoom ? "high" : "auto"}
    decoding="async"
    onLoad={(event) => onDimensions?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
    onError={() => setSourceIndex((index) => Math.min(index + 1, sources.length - 1))}
  />;
}
