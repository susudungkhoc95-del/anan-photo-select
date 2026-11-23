"use client";

import { ChevronLeft, ChevronRight, Focus, MessageSquare, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  REVIEW_NOTE_LIMIT, REVIEW_REGION_LIMIT, hasReviewFeedback,
  type ReviewBox, type ReviewFeedback, type ReviewPage, type ReviewPhotoFeedback
} from "@/lib/photo-review-types";
import type { Photo } from "@/lib/types";
import { reviewRequest } from "@/components/photo-review-api";
import { useReviewPhotoGestures } from "@/components/useReviewPhotoGestures";

type GalleryProps = {
  albumId: string;
  round: number;
  folder: string | null;
  feedbackOnly: boolean;
  feedback: ReviewFeedback;
  admin?: boolean;
  onEdit?: (id: string, feedback: ReviewPhotoFeedback) => void;
};

export function folderLabel(folder: string) {
  return folder || "Thư mục gốc";
}

export default function PhotoReviewGallery(props: GalleryProps) {
  const key = JSON.stringify([props.albumId, props.round, props.folder, props.feedbackOnly, props.admin]);
  return <ReviewGalleryPage key={key} {...props} />;
}

function ReviewGalleryPage({ albumId, round, folder, feedbackOnly, feedback, admin, onEdit }: GalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function load(offset: number, openFrom?: number) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    try {
      const page = await reviewRequest<ReviewPage>(admin ? "adminPhotos" : "photos",
        { albumId, round, folder, feedbackOnly, offset }, request.signal);
      if (request.signal.aborted) return;
      setPhotos((current) => offset ? [...current, ...page.photos] : page.photos);
      setTotal(page.total);
      if (openFrom !== undefined && page.photos.length) {
        setActiveIndex((current) => current === openFrom ? offset : current);
      }
    } catch (error) {
      if (!request.signal.aborted) setError((error as Error).message);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
    return () => controller.current?.abort();
  }, []);

  const active = activeIndex === null ? null : photos[activeIndex];
  const closePhoto = () => setActiveIndex(null);
  const previous = activeIndex !== null && activeIndex > 0 ? () => setActiveIndex(activeIndex - 1) : undefined;
  const next = activeIndex === null ? undefined
    : activeIndex + 1 < photos.length ? () => setActiveIndex(activeIndex + 1)
    : photos.length < total && !loading ? () => void load(photos.length, activeIndex) : undefined;
  return <>
    <p className="hint">Đang hiển thị {photos.length} / {total} ảnh</p>
    <div className="photos review-photo-grid">
      {photos.map((photo, index) => {
        const item = feedback[photo.id];
        const count = hasReviewFeedback(item) ? item.regions.length + Number(Boolean(item.note.trim())) : 0;
        return <button type="button" className="secondary photo review-photo-tile" key={photo.id}
          aria-label={`Mở ${photo.name}${count ? `, ${count} ghi chú` : ""}`} onClick={() => setActiveIndex(index)}>
          <ReviewImage albumId={albumId} round={round} photo={photo} admin={admin} />
          <span className="caption">{photo.name}</span>
          {count > 0 && <span className="review-note-count"><MessageSquare size={14} aria-hidden="true" />{count}</span>}
        </button>;
      })}
    </div>
    {loading && <p className="hint" role="status">Đang tải ảnh…</p>}
    {error && <div className="review-error" role="alert">{error} <button type="button" className="secondary"
      onClick={() => void load(photos.length)}>Thử lại</button></div>}
    {!loading && !error && !photos.length && <p className="empty">{feedbackOnly ? "Vòng này không có ảnh cần sửa." : "Thư mục này chưa có ảnh."}</p>}
    {!loading && !error && photos.length < total && <div className="load-more-action">
      <button className="secondary" type="button" onClick={() => void load(photos.length)}>Tải thêm ảnh</button>
    </div>}
    {active && activeIndex !== null && <ReviewPhotoDialog
      photoId={active.id}
      title={active.name}
      previous={previous}
      next={next}
      onClose={closePhoto}>
      <RegionEditor key={active.id} albumId={albumId} round={round} photo={active} admin={admin}
        previous={previous} next={next} onClose={closePhoto} feedback={feedback[active.id]} onEdit={onEdit && ((item) => onEdit(active.id, item))} />
      {error && <p className="review-error" role="alert">{error}</p>}
    </ReviewPhotoDialog>}
  </>;
}

function ReviewImage({ albumId, round, photo, large, admin, onLoad, onError }: {
  albumId: string; round: number; photo: Photo; large?: boolean; admin?: boolean;
  onLoad?: (image: HTMLImageElement) => void; onError?: () => void;
}) {
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const query = new URLSearchParams({ albumId, round: String(round), photoId: photo.id });
  if (admin) query.set("admin", "1");
  if (large) query.set("large", "1");
  if (failed) return <span className="review-photo-unavailable">Không tải được ảnh</span>;
  return <img src={fallback ? `/api/review/image?${query}`
    : `https://drive.google.com/thumbnail?id=${encodeURIComponent(photo.id)}&sz=w${large ? 2400 : 600}`}
    alt={photo.name} loading={large ? "eager" : "lazy"} decoding="async" draggable={false}
    referrerPolicy="no-referrer" onLoad={(event) => onLoad?.(event.currentTarget)}
    onError={() => {
      if (!fallback) setFallback(true);
      else { setFailed(true); onError?.(); }
    }} />;
}

function ReviewPhotoDialog({ photoId, title, onClose, previous, next, children }: {
  photoId: string; title: string; onClose: () => void; previous?: () => void; next?: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => { dialog.current?.scrollTo(0, 0); }, [photoId]);

  return <dialog className="review-photo-dialog panel" ref={dialog} aria-label={title}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowLeft" && previous) { event.preventDefault(); previous(); }
      if (event.key === "ArrowRight" && next) { event.preventDefault(); next(); }
    }}>
    {children}
  </dialog>;
}

type Point = { x: number; y: number };
const emptyFeedback: ReviewPhotoFeedback = { note: "", regions: [] };

function regionBox(start: Point, end: Point): ReviewBox {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) };
}

function boxStyle(box: ReviewBox) {
  return { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` };
}

function pointerPoint(event: PointerEvent<HTMLElement>, bounds: DOMRect): Point {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return { x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height) };
}

function RegionEditor({ albumId, round, photo, admin, feedback = emptyFeedback, onEdit, previous, next, onClose }: {
  albumId: string; round: number; photo: Photo; admin?: boolean; feedback?: ReviewPhotoFeedback;
  previous?: () => void; next?: () => void; onClose: () => void;
  onEdit?: (feedback: ReviewPhotoFeedback) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [aspect, setAspect] = useState(photo.width && photo.height ? photo.width / photo.height : 1);
  const [drawing, setDrawing] = useState(false);
  const { viewport, view, zoomBy, reset, maxScale } = useReviewPhotoGestures({ active: loaded && !drawing, previous, next });
  const [preview, setPreview] = useState<ReviewBox | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const drag = useRef<{ id: number; start: Point; bounds: DOMRect } | null>(null);
  const noteElements = useRef(new Map<number, HTMLElement>());

  function start(event: PointerEvent<HTMLDivElement>) {
    if (!drawing || drag.current || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = pointerPoint(event, bounds);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, start: point, bounds };
    setPreview(regionBox(point, point));
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current?.id === event.pointerId) setPreview(regionBox(current.start, pointerPoint(event, current.bounds)));
  }

  function cancel(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current?.id !== event.pointerId || !onEdit) return;
    const box = regionBox(current.start, pointerPoint(event, current.bounds));
    cancel(event);
    if (box.width * current.bounds.width < 6 || box.height * current.bounds.height < 6) return;
    const number = 1 + Math.max(0, ...feedback.regions.map((region) => region.number));
    onEdit({ ...feedback, regions: [...feedback.regions, { ...box, number, note: "" }] });
    setDrawing(false);
    setSelected(number);
    requestAnimationFrame(() => {
      const note = noteElements.current.get(number);
      note?.scrollIntoView({ block: "nearest" });
      if (event.pointerType !== "touch") note?.focus({ preventScroll: true });
    });
  }

  const drawButton = <button type="button" className={drawing ? "" : "secondary"}
    aria-label={drawing ? "Hủy vẽ" : "Khoanh vùng"} aria-pressed={drawing}
    disabled={!loaded || feedback.regions.length >= REVIEW_REGION_LIMIT}
    onClick={() => setDrawing(!drawing)}>
    <Focus size={17} aria-hidden="true" />
    <span className="review-draw-label">{drawing ? "Hủy vẽ" : "Khoanh vùng"}</span>
    <span className="review-draw-short-label" aria-hidden="true">{drawing ? "Hủy" : "Khoanh"}</span>
  </button>;

  return <>
    <div className="review-dialog-header">
      <h2 title={photo.name}>{photo.name}</h2>
      <div className="review-actions">
        {onEdit && <div className="review-mobile-draw">{drawButton}</div>}
        <button type="button" className="secondary icon-button" aria-label="Ảnh trước" disabled={!previous} onClick={previous}><ChevronLeft size={20} /></button>
        <button type="button" className="secondary icon-button" aria-label="Ảnh tiếp theo" disabled={!next} onClick={next}><ChevronRight size={20} /></button>
        <button type="button" className="secondary" onClick={onClose}>{onEdit ? "Xong" : "Đóng"}</button>
      </div>
    </div>
    <div className="review-editor">
      <div className="review-editor-stage">
        <div className="review-draw-toolbar">
          {onEdit && drawButton}
          <div className="review-zoom-controls" role="group" aria-label="Thu phóng ảnh">
            <button type="button" className="secondary icon-button" aria-label="Thu nhỏ"
              disabled={!loaded || view.scale === 1} onClick={() => zoomBy(-.5)}><Minus size={18} aria-hidden="true" /></button>
            <button type="button" className="secondary review-zoom-reset" aria-label="Về kích thước ban đầu"
              disabled={view.scale === 1} onClick={reset}>{Math.round(view.scale * 100)}%</button>
            <button type="button" className="secondary icon-button" aria-label="Phóng to"
              disabled={!loaded || view.scale === maxScale} onClick={() => zoomBy(.5)}><Plus size={18} aria-hidden="true" /></button>
          </div>
        </div>
        <div ref={viewport} className={`review-image-window${drawing ? " drawing" : view.scale > 1 ? " zoomed" : ""}`}
          style={{ "--review-aspect": aspect, "--review-zoom": view.scale } as React.CSSProperties}>
          <div className="review-image-plane" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
            <ReviewImage albumId={albumId} round={round} photo={photo} large admin={admin}
              onLoad={(image) => {
                if (!image.naturalWidth || !image.naturalHeight) return;
                setAspect(image.naturalWidth / image.naturalHeight);
                setLoaded(true);
              }} onError={() => { setLoaded(false); setDrawing(false); }} />
            {loaded && <div className={drawing ? "review-region-layer drawing" : "review-region-layer"}
              onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}>
              {feedback.regions.map((region) => <div key={region.number} style={boxStyle(region)}
                className={selected === region.number ? "review-region active" : "review-region"}>
                <button type="button" className="review-region-number" disabled={drawing}
                  aria-label={`Xem ghi chú vùng ${region.number}`}
                  onClick={() => {
                    setSelected(region.number);
                    const note = noteElements.current.get(region.number);
                    note?.scrollIntoView({ block: "nearest" });
                  }}>{region.number}</button>
              </div>)}
              {preview && <div className="review-region active" style={boxStyle(preview)} />}
            </div>}
          </div>
        </div>
        {drawing ? <p className="review-gesture-hint">Kéo trên ảnh để vẽ khung.</p> : loaded &&
          <p className="review-gesture-hint review-touch-hint">
            {view.scale > 1 ? "Kéo để xem · Chạm hai lần để thu về" : "Chụm hoặc chạm hai lần để zoom · Vuốt ngang để đổi ảnh"}
          </p>}
      </div>
      <aside className="review-editor-notes">
        <p className="hint">{folderLabel(photo.folder)}</p>
        {onEdit ? <label>Ghi chú cả ảnh
          <textarea rows={3} maxLength={REVIEW_NOTE_LIMIT} value={feedback.note}
            onChange={(event) => onEdit({ ...feedback, note: event.target.value })} />
        </label> : feedback.note && <div className="review-region-note"><strong>Ghi chú cả ảnh</strong><p>{feedback.note}</p></div>}
        {feedback.regions.map((region) => <div key={region.number} className={selected === region.number ? "review-region-note active" : "review-region-note"}>
          <div className="review-note-heading">
            <button type="button" className="secondary" aria-pressed={selected === region.number}
              onClick={() => setSelected(region.number)}>Vùng {region.number}</button>
            {onEdit && <button type="button" className="secondary icon-button" aria-label={`Xóa vùng ${region.number}`}
              onClick={() => {
                onEdit({ ...feedback, regions: feedback.regions.filter((item) => item.number !== region.number) });
                if (selected === region.number) setSelected(null);
              }}><Trash2 size={16} /></button>}
          </div>
          {onEdit ? <textarea rows={2} maxLength={REVIEW_NOTE_LIMIT} aria-label={`Ghi chú vùng ${region.number}`}
            ref={(element) => { if (element) noteElements.current.set(region.number, element); else noteElements.current.delete(region.number); }}
            value={region.note}
            onFocus={() => setSelected(region.number)}
            onChange={(event) => onEdit({
              ...feedback, regions: feedback.regions.map((item) =>
                item.number === region.number ? { ...item, note: event.target.value } : item)
            })} />
            : <p ref={(element) => { if (element) noteElements.current.set(region.number, element); else noteElements.current.delete(region.number); }}>{region.note}</p>}
        </div>)}
        {!onEdit && !hasReviewFeedback(feedback) && <p className="hint">Ảnh này chưa có ghi chú.</p>}
      </aside>
    </div>
  </>;
}
