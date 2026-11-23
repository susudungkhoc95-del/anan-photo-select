"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import PhotoReviewGallery, { folderLabel } from "@/components/PhotoReviewGallery";
import { ReviewRequestError, reviewRequest } from "@/components/photo-review-api";
import {
  hasReviewFeedback, type ReviewAlbum, type ReviewFeedback, type ReviewPhotoFeedback, type ReviewRound
} from "@/lib/photo-review-types";

type ReviewData = { album: ReviewAlbum; round: ReviewRound };
type LocalDraft = { revision: string; feedback: ReviewFeedback };

export default function PhotoReviewClient({ albumId }: { albumId: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void reviewRequest<ReviewData>("client", { albumId }, controller.signal)
      .then(setData).catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [albumId, attempt]);

  if (error) return <main className="client-page client-error">
    <h1>Không mở được album</h1><p>{error}</p>
    <button className="secondary" type="button" onClick={() => setAttempt((value) => value + 1)}>Thử lại</button>
  </main>;
  if (!data) return <div className="page-loader client-page-loader"><span className="spinner" /> Đang mở album duyệt…</div>;
  return <ClientRound key={data.round.number} album={data.album} initialRound={data.round} />;
}

function readLocalDraft(key: string): LocalDraft | null {
  try { return JSON.parse(localStorage.getItem(key) || "null") as LocalDraft | null; }
  catch { return null; }
}

function writeLocalDraft(key: string, value: LocalDraft | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // The server still saves drafts if browser storage is unavailable.
  }
}

function ClientRound({ album, initialRound }: { album: ReviewAlbum; initialRound: ReviewRound }) {
  const { number } = initialRound;
  const [round, setRound] = useState(initialRound);
  const [feedback, setFeedback] = useState(initialRound.feedback);
  const [folder, setFolder] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [recovery, setRecovery] = useState<ReviewFeedback | null>(null);
  const pending = useRef<ReviewFeedback | null>(null);
  const revision = useRef(initialRound.revision);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const submissionId = useRef("");
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const key = `anan-review:${album.id}:${number}`;

  useEffect(() => {
    if (initialRound.submittedAt) {
      writeLocalDraft(key, null);
      return;
    }
    const saved = readLocalDraft(key);
    if (!saved?.feedback) return;
    if (saved.revision === initialRound.revision) {
      pending.current = saved.feedback;
      setFeedback(saved.feedback);
    } else {
      setRecovery(saved.feedback);
    }
  }, [initialRound, key]);

  function queue(next: ReviewFeedback) {
    pending.current = next;
    writeLocalDraft(key, { revision: revision.current, feedback: next });
    setFeedback(next);
    setStatus("Đang lưu nháp…");
    setError("");
  }

  function edit(id: string, item: ReviewPhotoFeedback) {
    const next = { ...(pending.current || feedback) };
    if (item.note || item.regions.length) next[id] = item;
    else delete next[id];
    queue(next);
  }

  async function flush(): Promise<boolean> {
    if (inFlight.current) {
      if (!await inFlight.current) return false;
    }
    const draft = pending.current;
    if (!draft) return true;
    const request = (async () => {
      setStatus("Đang lưu nháp…");
      try {
        const saved = await reviewRequest<ReviewRound>("draft", {
          albumId: album.id, round: number, revision: revision.current, feedback: draft
        });
        revision.current = saved.revision;
        if (pending.current === draft) pending.current = null;
        writeLocalDraft(key, pending.current && { revision: revision.current, feedback: pending.current });
        setStatus(pending.current ? "Đang lưu nháp…" : "Đã lưu nháp");
        return true;
      } catch (error) {
        setStatus("");
        setConflict(error instanceof ReviewRequestError && error.status === 409);
        setError((error as Error).message);
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = request;
    if (!await request) return false;
    return pending.current ? flush() : true;
  }

  useEffect(() => {
    if (!pending.current || conflict || recovery || round.submittedAt) return;
    const timeout = window.setTimeout(() => void flush(), 650);
    return () => window.clearTimeout(timeout);
  }, [feedback, conflict, recovery, round.submittedAt]);

  useEffect(() => {
    if (reviewing) reviewHeading.current?.focus();
  }, [reviewing]);

  const count = Object.values(feedback).filter(hasReviewFeedback).length;
  const incomplete = Object.values(feedback).some((item) => item.regions.some((region) => !region.note.trim()));
  const locked = Boolean(round.submittedAt);
  const editable = !locked && !reviewing && !busy && !conflict && !recovery;

  async function prepare() {
    if (!count) return;
    if (incomplete) {
      setError("Hãy điền ghi chú cho tất cả vùng đã khoanh trước khi gửi.");
      window.scrollTo(0, 0);
      return;
    }
    setError("");
    setBusy(true);
    if (await flush()) setReviewing(true);
    setBusy(false);
  }

  async function submit() {
    setBusy(true);
    setError("");
    submissionId.current ||= crypto.randomUUID();
    try {
      const saved = await reviewRequest<ReviewRound>("submit", {
        albumId: album.id, round: number, revision: revision.current, feedback,
        submissionId: submissionId.current, outcome: "changes"
      });
      revision.current = saved.revision;
      setRound(saved);
      setFeedback(saved.feedback);
      setReviewing(false);
      window.scrollTo(0, 0);
      writeLocalDraft(key, null);
      setStatus("");
    } catch (error) {
      setConflict(error instanceof ReviewRequestError && error.status === 409);
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function chooseFolder(name: string | null) {
    setFolder(name);
    window.scrollTo(0, 0);
  }

  return <main className={`client-page photo-review-client${locked ? "" : " review-has-submit"}`}>
    <div className="studio-banner"><span>ANAN Studio</span></div>
    {!reviewing && <div className="toolbar review-folder-toolbar">
      <div className="toolbar-inner">
        <div className="review-folder-buttons" role="group" aria-label="Lọc ảnh theo thư mục">
          <button type="button" className="secondary" aria-pressed={folder === null}
            onClick={() => chooseFolder(null)}>Tất cả ảnh</button>
          {round.folders.map(({ name }) => <button type="button" className="secondary" key={name}
            aria-pressed={folder === name} onClick={() => chooseFolder(name)}>{folderLabel(name)}</button>)}
        </div>
      </div>
    </div>}
    <section className="gallery-shell shell">
      <div className="client-head">
        <div className="client-title">
          <p className="hint">Duyệt ảnh sửa · Vòng {number}</p>
          <h1>{album.title}</h1>
          {!locked && !reviewing && <p className="hint">Mở ảnh để khoanh vùng hoặc ghi chú chỉnh sửa.</p>}
        </div>
      </div>
      {locked && <p className="success-banner" role="status">{round.outcome === "approved"
        ? "Bạn đã duyệt bộ ảnh này." : `Studio đã nhận phản hồi cho ${round.feedbackCount} ảnh.`}</p>}
      {recovery && <div className="review-error" role="alert">
        <p>Thiết bị này còn một bản nháp. Bạn muốn tiếp tục với bản nào?</p>
        <div className="review-actions">
          <button type="button" className="secondary" onClick={() => { writeLocalDraft(key, null); setRecovery(null); }}>Bản đã lưu</button>
          <button type="button" onClick={() => { queue(recovery); setRecovery(null); }}>Bản trên thiết bị</button>
        </div>
      </div>}
      {error && <div className="review-error" role="alert">
        <p>{error}</p>
        {conflict ? <button className="secondary" type="button" onClick={() => location.reload()}>Tải lại trang</button>
          : pending.current && <button className="secondary" type="button" onClick={() => { setError(""); void flush(); }}>Thử lưu lại</button>}
      </div>}
      {status && <p className="hint" role="status">{status}</p>}
      {reviewing && <div className="review-confirm panel">
        <h2 ref={reviewHeading} tabIndex={-1}>Xem lại chỉnh sửa</h2>
        <p>Studio sẽ nhận góp ý cho {count} ảnh ở vòng này.</p>
      </div>}
      {(!reviewing || count > 0) && <PhotoReviewGallery albumId={album.id} round={number}
        folder={reviewing ? null : folder} feedbackOnly={reviewing} feedback={feedback} onEdit={editable ? edit : undefined} />}
    </section>
    {!locked && <div className="review-submit-bar">
      <div className="review-submit-inner">
        {reviewing
          ? <button type="button" className="secondary" disabled={busy}
              onClick={() => { setReviewing(false); setError(""); }}>Về album</button>
          : <span className="counter" id="review-submit-summary">{count ? `${count} ảnh cần sửa` : "Thêm ghi chú để gửi"}</span>}
        {reviewing
          ? <button type="button" disabled={busy || conflict} onClick={() => void submit()}>
              <Send size={16} aria-hidden="true" /> {busy ? "Đang gửi…" : "Xác nhận gửi"}
            </button>
          : <button type="button" disabled={!editable || !count} aria-describedby="review-submit-summary"
              onClick={() => void prepare()}><Send size={16} aria-hidden="true" /> Gửi chỉnh sửa</button>}
      </div>
    </div>}
  </main>;
}
