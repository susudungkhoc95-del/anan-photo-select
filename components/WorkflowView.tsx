"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, Copy, ExternalLink, MoreVertical, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { rpc } from "@/components/App";
import type { WorkflowBoard, WorkflowCard, WorkflowLabel, WorkflowLink, WorkflowList } from "@/lib/types";
import { normalizeWorkflowText, workflowAge, workflowCardMatches } from "@/lib/workflow-utils";

type ModalState = { cardId: string } | null;
type CreateState = { type: "list" } | { type: "card"; list: WorkflowList } | null;
const LABEL_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];
const WORKFLOW_CACHE_KEY = "anan-workflow-board";
const ADMIN_SESSION_KEY = "anan-admin-session";
const WORKFLOW_CACHE_TTL = 60 * 1000;

function cachedBoard(): WorkflowBoard | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(WORKFLOW_CACHE_KEY) || "null") as { data?: WorkflowBoard; savedAt?: number } | null;
    if (!cached || typeof cached.savedAt !== "number" || Date.now() - cached.savedAt >= WORKFLOW_CACHE_TTL) {
      sessionStorage.removeItem(WORKFLOW_CACHE_KEY);
      return null;
    }
    const value = cached.data;
    return value?.lists && value?.cards ? value : null;
  } catch { return null; }
}

function cacheBoard(board: WorkflowBoard) {
  try { sessionStorage.setItem(WORKFLOW_CACHE_KEY, JSON.stringify({ data: board, savedAt: Date.now() })); } catch {}
}

function formatTime(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatWeddingDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return Number(year) === new Date().getFullYear() ? `${day}/${month}` : `${day}/${month}/${year.slice(-2)}`;
}

export default function WorkflowView() {
  // The first client render must match SSR. Read sessionStorage only after mount,
  // otherwise a saved browser session renders the board before hydration.
  const [auth, setAuth] = useState<"loading" | "yes" | "no">("loading");
  const [board, setBoard] = useState<WorkflowBoard | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [cardModal, setCardModal] = useState<ModalState>(null);
  const [createModal, setCreateModal] = useState<CreateState>(null);
  const [deleteList, setDeleteList] = useState<WorkflowList | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [quickCardId, setQuickCardId] = useState<string | null>(null);
  const [pendingCardIds, setPendingCardIds] = useState<Set<string>>(() => new Set());
  const pendingCardsRef = useRef(new Map<string, WorkflowCard>());
  const refreshingRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = useCallback(async (silent = false) => {
    if (refreshingRef.current) {
      refreshPendingRef.current = true;
      return;
    }
    refreshingRef.current = true;
    try {
      const nextBoard = await rpc<WorkflowBoard>("getWorkflowBoard");
      // Keep cards that were added optimistically visible while a background
      // write is still in flight (a periodic refresh can happen meanwhile).
      const pendingCards = [...pendingCardsRef.current.values()];
      const serverCardIds = new Set(nextBoard.cards.map((card) => card.id));
      const mergedBoard = pendingCards.length
        ? { ...nextBoard, cards: [...nextBoard.cards, ...pendingCards.filter((card) => !serverCardIds.has(card.id))] }
        : nextBoard;
      cacheBoard(mergedBoard);
      setBoard(mergedBoard);
    }
    catch (error) { if (!silent) setMessage((error as Error).message); }
    finally {
      refreshingRef.current = false;
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void load(true);
      }
    }
  }, []);

  useEffect(() => {
    document.body.classList.add("admin-mode");
    document.body.classList.remove("admin-light-mode");
    return () => document.body.classList.remove("admin-mode", "admin-light-mode");
  }, []);

  useEffect(() => {
    if (auth !== "yes") return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(refreshWhenVisible, 12_000);
    window.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [auth, load]);
  useEffect(() => {
    let active = true;
    // Start both requests at once. A cached board paints immediately while the
    // fresh board keeps the workflow accurate in the background.
    const cached = cachedBoard();
    if (cached) setBoard(cached);
    const boardRequest = rpc<WorkflowBoard>("getWorkflowBoard");
    void boardRequest.catch(() => {});
    fetch("/api/auth").then((response) => response.json()).then(({ authenticated }) => {
      if (!active) return;
      setAuth(authenticated ? "yes" : "no");
      if (!authenticated) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        return;
      }
      sessionStorage.setItem(ADMIN_SESSION_KEY, "yes");
      boardRequest.then((nextBoard) => {
        if (!active) return;
        cacheBoard(nextBoard);
        setBoard(nextBoard);
      }).catch((error) => { if (active) setMessage((error as Error).message); });
    }).catch(() => { if (active) setAuth("no"); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!board || !query.trim()) return board?.cards || [];
    const needle = normalizeWorkflowText(query.trim());
    return board.cards.filter((card) => workflowCardMatches(card, board.links.filter((link) => link.cardId === card.id), query) || board.labels.some((label) => board.cardLabels.some((assignment) => assignment.cardId === card.id && assignment.labelId === label.id) && normalizeWorkflowText(label.name).includes(needle)));
  }, [board, query]);

  async function addList(name: string) {
    try { await rpc("createWorkflowList", { name }); setCreateModal(null); await load(); } catch (error) { setMessage((error as Error).message); }
  }

  async function renameList(list: WorkflowList) {
    const name = window.prompt("Đổi tên danh sách:", list.name);
    if (name === null) return;
    try { await rpc("updateWorkflowList", { listId: list.id, name }); await load(); } catch (error) { setMessage((error as Error).message); }
  }

  async function addCard(list: WorkflowList, title: string) {
    const timestamp = new Date().toISOString();
    const cardId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`;
    const optimisticCard: WorkflowCard = {
      id: cardId, workspaceId: board?.workspaceId || "", listId: list.id, title, note: "", weddingDate: "",
      position: Math.max(-1, ...(board?.cards.filter((card) => card.listId === list.id).map((card) => card.position) || []) ) + 1,
      source: "manual", dpSelectAlbumId: "", dpSelectSubmissionId: "", selectionSubmittedAt: "", createdAt: timestamp,
      updatedAt: timestamp, completedAt: list.systemKey === "DONE" ? timestamp : "", createdBy: "admin", dpSummary: ""
    };
    pendingCardsRef.current.set(cardId, optimisticCard);
    setPendingCardIds((current) => new Set(current).add(cardId));
    setBoard((current) => current ? { ...current, cards: [...current.cards, optimisticCard] } : current);
    setCreateModal(null);
    try {
      await rpc("createWorkflowCard", { cardId, listId: list.id, title });
      pendingCardsRef.current.delete(cardId);
      setPendingCardIds((current) => { const next = new Set(current); next.delete(cardId); return next; });
      await load(true);
    } catch (error) {
      pendingCardsRef.current.delete(cardId);
      setPendingCardIds((current) => { const next = new Set(current); next.delete(cardId); return next; });
      setBoard((current) => current ? { ...current, cards: current.cards.filter((card) => card.id !== cardId) } : current);
      setMessage(`Không thể lưu thẻ “${title}”: ${(error as Error).message}`);
      void load(true);
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!board || query.trim() || !event.over) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    try {
      if (activeId.startsWith("list-")) {
        const activeListId = activeId.slice(5);
        const overCard = board.cards.find((card) => `card-${card.id}` === overId);
        const overListId = overCard?.listId || (overId.startsWith("list-") ? overId.slice(5) : overId.startsWith("column-") ? overId.slice(7) : "");
        if (!overListId || activeListId === overListId) return;
        const oldIndex = board.lists.findIndex((list) => list.id === activeListId);
        const newIndex = board.lists.findIndex((list) => list.id === overListId);
        const lists = arrayMove(board.lists, oldIndex, newIndex);
        setBoard({ ...board, lists });
        await rpc("reorderWorkflowLists", { orderedIds: lists.map((list) => list.id) });
      } else if (activeId.startsWith("card-")) {
        const cardId = activeId.slice(5);
        const card = board.cards.find((item) => item.id === cardId);
        if (!card) return;
        const overCard = board.cards.find((item) => `card-${item.id}` === overId);
        const targetListId = overCard?.listId || (overId.startsWith("column-") ? overId.slice(7) : overId.startsWith("list-") ? overId.slice(5) : "");
        if (!targetListId) return;
        const sourceCards = board.cards.filter((item) => item.listId === card.listId && item.id !== card.id);
        const targetWithout = board.cards.filter((item) => item.listId === targetListId && item.id !== card.id);
        const insertAt = overCard ? targetWithout.findIndex((item) => item.id === overCard.id) : targetWithout.length;
        const targetCards = [...targetWithout]; targetCards.splice(Math.max(0, insertAt), 0, { ...card, listId: targetListId });
        const cards = targetListId === card.listId
          // sourceCards and targetWithout are the same list in this case.
          // Combining both used to duplicate every card after a same-list drop.
          ? [...board.cards.filter((item) => item.listId !== card.listId), ...targetCards]
          : [...board.cards.filter((item) => item.listId !== card.listId && item.listId !== targetListId), ...sourceCards, ...targetCards];
        setBoard({ ...board, cards });
        await rpc("moveWorkflowCard", { cardId, targetListId, orderedIds: targetCards.map((item) => item.id), sourceOrderedIds: sourceCards.map((item) => item.id) });
      }
    } catch (error) { setMessage((error as Error).message); await load(); }
  }

  function onDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  if (auth === "loading" || !board) return <div className="page-loader"><span className="spinner" /> Đang mở DP Workflow…</div>;
  if (auth === "no") {
    if (typeof window !== "undefined") window.location.replace("/");
    return <div className="page-loader">Đang chuyển đến trang đăng nhập…</div>;
  }

  return <main className="workflow-page">
    <header className="workflow-header">
      <div className="workflow-header-left"><div className="workflow-brand"><img src="/dp-logo.png" alt="DP Select" /></div><nav className="app-tabs header-tabs" aria-label="Khu vực quản trị"><Link href="/" prefetch>DP Select</Link><Link className="active" href="/workflow">DP Workflow</Link></nav></div>
      <div className="workflow-header-actions"><div className="workflow-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Tìm kiếm thẻ..." />{query && <button className="icon-button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={16} /></button>}</div></div>
    </header>
    {message && <div className="workflow-message notice">{message}<button className="text-button" onClick={() => setMessage("")}>Đóng</button></div>}
    {query && <p className="workflow-search-note">Xóa tìm kiếm để sắp xếp thẻ.</p>}
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragCancel={() => setActiveDragId(null)} onDragEnd={(event) => { void onDragEnd(event).finally(() => setActiveDragId(null)); }}>
      <SortableContext items={board.lists.map((list) => `list-${list.id}`)} strategy={horizontalListSortingStrategy}>
        <div className="workflow-board">
          {board.lists.map((list) => <WorkflowColumn key={list.id} list={list} cards={filtered.filter((card) => card.listId === list.id)} labels={board.labels} cardLabelIds={board.cardLabels} pendingCardIds={pendingCardIds} searching={Boolean(query)} onAdd={() => setCreateModal({ type: "card", list })} onOpen={(cardId) => setCardModal({ cardId })} onQuickEdit={setQuickCardId} onRename={() => renameList(list)} onDelete={() => setDeleteList(list)} />)}
          <button type="button" className="workflow-add-list" onClick={() => setCreateModal({ type: "list" })}><Plus size={18} /> Thêm danh sách</button>
        </div>
      </SortableContext>
      <DragOverlay>{activeDragId?.startsWith("card-") && <WorkflowCardPreview card={board.cards.find((card) => `card-${card.id}` === activeDragId)} />}{activeDragId?.startsWith("list-") && <WorkflowListPreview list={board.lists.find((list) => `list-${list.id}` === activeDragId)} />}</DragOverlay>
    </DndContext>
    {cardModal && <CardModal board={board} cardId={cardModal.cardId} onClose={() => setCardModal(null)} onChanged={load} onDeleted={(cardId) => { setBoard((current) => current ? { ...current, cards: current.cards.filter((item) => item.id !== cardId), links: current.links.filter((item) => item.cardId !== cardId), cardLabels: current.cardLabels.filter((item) => item.cardId !== cardId), activities: current.activities.filter((item) => item.cardId !== cardId) } : current); setCardModal(null); void load(true); }} onError={(error) => setMessage(error.message)} />}
    {quickCardId && <QuickCardModal board={board} cardId={quickCardId} onClose={() => setQuickCardId(null)} onChanged={load} />}
    {labelsOpen && <LabelsModal board={board} onClose={() => setLabelsOpen(false)} onChanged={load} />}
    {createModal && <CreateWorkflowModal state={createModal} onClose={() => setCreateModal(null)} onCreate={(value) => createModal.type === "list" ? addList(value) : addCard(createModal.list, value)} />}
    {deleteList && <DeleteListModal list={deleteList} lists={board.lists} cardCount={board.cards.filter((card) => card.listId === deleteList.id).length} onClose={() => setDeleteList(null)} onDeleted={async (targetListId) => { try { await rpc("deleteWorkflowList", { listId: deleteList.id, targetListId }); setDeleteList(null); await load(); } catch (error) { setMessage((error as Error).message); } }} />}
    <button type="button" className="secondary settings-fab workflow-settings-fab" onClick={() => setLabelsOpen((open) => !open)} aria-label={labelsOpen ? "Đóng cài đặt Workflow" : "Cài đặt Workflow"}><Settings size={19} /></button>
  </main>;
}

function WorkflowColumn({ list, cards, labels, cardLabelIds, pendingCardIds, searching, onAdd, onOpen, onQuickEdit, onRename, onDelete }: { list: WorkflowList; cards: WorkflowCard[]; labels: WorkflowLabel[]; cardLabelIds: WorkflowBoard["cardLabels"]; pendingCardIds: Set<string>; searching: boolean; onAdd: () => void; onOpen: (id: string) => void; onQuickEdit: (id: string) => void; onRename: () => void; onDelete: () => void }) {
  const sortable = useSortable({ id: `list-${list.id}`, data: { type: "list" } });
  const droppable = useDroppable({ id: `column-${list.id}`, data: { type: "column" } });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return <section ref={(node) => { sortable.setNodeRef(node); droppable.setNodeRef(node); }} style={style} className={`workflow-column ${sortable.isDragging ? "dragging" : ""}`}>
    <header><div><h2 className="workflow-list-title" {...sortable.attributes} {...sortable.listeners} title="Giữ để kéo danh sách">{list.name}</h2><span>{cards.length} thẻ</span></div><details><summary aria-label="Menu danh sách">•••</summary><button onClick={onRename}>Đổi tên</button><button onClick={onDelete}>Xóa danh sách</button></details></header>
    <SortableContext items={cards.map((card) => `card-${card.id}`)} strategy={rectSortingStrategy}>
      <div className="workflow-cards">{cards.map((card) => <WorkflowCardItem key={card.id} card={card} list={list} pending={pendingCardIds.has(card.id)} labels={labels.filter((label) => cardLabelIds.some((assignment) => assignment.cardId === card.id && assignment.labelId === label.id))} onOpen={() => onOpen(card.id)} onQuickEdit={() => onQuickEdit(card.id)} />)}{!cards.length && <p className="workflow-empty">{searching ? "Không có kết quả" : "Chưa có thẻ"}</p>}</div>
    </SortableContext>
    {!searching && <button type="button" className="workflow-add-card" onClick={onAdd}><Plus size={17} /> Thêm thẻ</button>}
  </section>;
}

function WorkflowCardPreview({ card }: { card?: WorkflowCard }) {
  if (!card) return null;
  return <article className="workflow-card workflow-drag-overlay"><h3>{card.title}</h3>{card.note && <p>{card.note}</p>}</article>;
}

function WorkflowListPreview({ list }: { list?: WorkflowList }) {
  if (!list) return null;
  return <section className="workflow-list-drag-overlay"><h2>{list.name}</h2><span>Đang kéo danh sách</span></section>;
}

function CreateWorkflowModal({ state, onClose, onCreate }: { state: Exclude<CreateState, null>; onClose: () => void; onCreate: (value: string) => void }) {
  const [value, setValue] = useState("");
  const label = state.type === "list" ? "Tên danh sách" : "Tên thẻ";
  const title = state.type === "list" ? "Thêm danh sách" : `Thêm thẻ vào “${state.list.name}”`;
  return <div className="modal-backdrop workflow-modal-backdrop" onMouseDown={onClose}>
    <form className="workflow-create-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (value.trim()) onCreate(value.trim()); }}>
      <header><div><p className="eyebrow">DP WORKFLOW</p><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></header>
      <label>{label}<input autoFocus maxLength={200} value={value} onChange={(event) => setValue(event.target.value)} placeholder={state.type === "list" ? "Ví dụ: CHỜ DUYỆT" : "Ví dụ: Chỉnh màu album"} /></label>
      <footer><button type="button" className="secondary" onClick={onClose}>Huỷ</button><button type="submit" disabled={!value.trim()}><Plus size={16} /> Tạo mới</button></footer>
    </form>
  </div>;
}

function WorkflowCardItem({ card, list, pending, labels, onOpen, onQuickEdit }: { card: WorkflowCard; list: WorkflowList; pending: boolean; labels: WorkflowLabel[]; onOpen: () => void; onQuickEdit: () => void }) {
  const sortable = useSortable({ id: `card-${card.id}`, data: { type: "card" } });
  const age = workflowAge(card, list);
  return <article ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className={`workflow-card ${sortable.isDragging ? "dragging" : ""} ${pending ? "saving" : ""}`} {...sortable.attributes} {...sortable.listeners} onClick={onOpen}>
    <button type="button" className="icon-button workflow-card-menu" aria-label={`Cài đặt nhanh ${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onQuickEdit(); }}><MoreVertical size={17} /></button>
    <h3>{card.title}</h3>{card.note && <p>{card.note}</p>}
    <footer><span className={`workflow-age ${age.level}`}>{pending ? "Đang lưu…" : age.label}</span>{labels.length > 0 && <div className="workflow-label-chips">{labels.map((label) => <span key={label.id} style={{ "--label-color": label.color } as React.CSSProperties}>{label.name}</span>)}</div>}{card.weddingDate && <span className="workflow-card-wedding-date">Ngày cưới {formatWeddingDate(card.weddingDate)}</span>}</footer>
  </article>;
}

function CardModal({ board, cardId, onClose, onChanged, onDeleted, onError }: { board: WorkflowBoard; cardId: string; onClose: () => void; onChanged: () => Promise<void>; onDeleted: (cardId: string) => void; onError: (error: Error) => void }) {
  const card = board.cards.find((item) => item.id === cardId)!;
  const list = board.lists.find((item) => item.id === card.listId)!;
  const [title, setTitle] = useState(card.title);
  const [note, setNote] = useState(card.note);
  const [weddingDate, setWeddingDate] = useState(card.weddingDate);
  const [busy, setBusy] = useState(false);
  const [cardError, setCardError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const links = board.links.filter((item) => item.cardId === card.id);
  const activities = board.activities.filter((item) => item.cardId === card.id).slice(0, 3);
  const [selectedLabelIds, setSelectedLabelIds] = useState(() => board.cardLabels.filter((item) => item.cardId === card.id).map((item) => item.labelId));
  const age = workflowAge(card, list);
  async function save() { setBusy(true); try { await rpc("updateWorkflowCard", { cardId: card.id, title, note, weddingDate }); await rpc("setWorkflowCardLabels", { cardId: card.id, labelIds: selectedLabelIds }); await onChanged(); onClose(); } finally { setBusy(false); } }
  async function editLink(link: WorkflowLink) { const nextLabel = window.prompt("Tên hiển thị:", link.label); if (nextLabel === null) return; const nextUrl = window.prompt("URL:", link.url); if (nextUrl === null) return; await rpc("updateWorkflowLink", { linkId: link.id, label: nextLabel, url: nextUrl }); await onChanged(); }
  async function copyLink(link: WorkflowLink) {
    await navigator.clipboard.writeText(link.url);
    setCopiedLinkId(link.id);
    window.setTimeout(() => setCopiedLinkId((current) => current === link.id ? null : current), 1600);
  }
  async function removeCard() {
    setBusy(true);
    try { await rpc("deleteWorkflowCard", { cardId: card.id }); onDeleted(card.id); }
    catch (error) { const nextError = error as Error; setCardError(nextError.message); onError(nextError); }
    finally { setBusy(false); }
  }
  async function toggleLabel(labelId: string) {
    setSelectedLabelIds((current) => current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId]);
  }
  return <div className="modal-backdrop workflow-modal-backdrop" onMouseDown={onClose}><section className="workflow-modal" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><h2>Chi tiết thẻ</h2><p className="eyebrow">{card.source === "dp_select" ? "TỪ DP SELECT" : "THẺ THỦ CÔNG"}</p></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></header>
    <label>Tên thẻ<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
    <div className="workflow-date-field"><label>Ngày cưới<input type="date" value={weddingDate} onChange={(event) => setWeddingDate(event.target.value)} /></label><button type="button" className="secondary compact" disabled={!weddingDate || busy} onClick={() => setWeddingDate("")}>Xóa ngày</button></div>
    {cardError && <div className="workflow-message notice">{cardError}</div>}
    <div className="workflow-time"><span className="workflow-created">Thẻ tạo: <b>{formatTime(card.createdAt)}</b></span><span className="workflow-submitted">Khách gửi ảnh: <b>{formatTime(card.selectionSubmittedAt)}</b></span><span className="workflow-updated">Cập nhật: <b>{formatTime(card.updatedAt)}</b></span>{card.completedAt && <span className="workflow-completed">Hoàn thành: <b>{formatTime(card.completedAt)}</b></span>}<span className={`workflow-status ${age.level}`}>Trạng thái: <b>{age.label}</b></span></div>
    <section className="workflow-links"><h3>Đường link</h3>{links.map((link) => { const isSheetLink = link.label.toLowerCase().includes("sheet"); return <div key={link.id} className="workflow-link"><span className="workflow-link-main"><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink size={13} /></a>{isSheetLink && card.dpSummary && <small className="workflow-link-summary">{card.dpSummary}</small>}</span><span className="workflow-link-actions">{isSheetLink && <button type="button" className="text-button" onClick={() => void copyLink(link)}><Copy size={13} />{copiedLinkId === link.id ? "Đã copy" : "Copy"}</button>}<button type="button" className="text-button" onClick={() => void editLink(link)}>Sửa</button></span></div>; })}</section>
    <label>Ghi chú<textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <section className="workflow-card-labels"><h3>Nhãn</h3>{board.labels.length ? <div className="workflow-label-picker">{board.labels.map((label) => <label key={label.id} className={selectedLabelIds.includes(label.id) ? "selected" : ""} style={{ "--label-color": label.color } as React.CSSProperties}><input type="checkbox" checked={selectedLabelIds.includes(label.id)} disabled={busy} onChange={() => toggleLabel(label.id)} />{label.name}</label>)}</div> : <p className="muted">Chưa có nhãn. Bấm nút Nhãn ở đầu trang để tạo nhãn.</p>}</section>
    <section className="workflow-activity"><h3>Lịch sử hoạt động</h3>{activities.length ? activities.map((item) => <p key={item.id}><time>{formatTime(item.createdAt)}</time>{item.description}</p>) : <p className="muted">Chưa có hoạt động.</p>}</section>
    {confirmingDelete && <div className="workflow-delete-confirm"><span>Xóa thẻ này cùng toàn bộ link và lịch sử?</span><button type="button" className="secondary compact" disabled={busy} onClick={() => setConfirmingDelete(false)}>Hủy</button><button type="button" className="danger compact" disabled={busy} onClick={() => void removeCard()}>Xác nhận xóa</button></div>}
    <footer><button type="button" className="danger" disabled={busy} onClick={() => setConfirmingDelete(true)}><Trash2 size={16} /> Xóa thẻ</button><span /><button type="button" className="secondary" disabled={busy} onClick={onClose}>Đóng</button><button type="button" disabled={busy} onClick={() => void save()}><Check size={16} /> Lưu thay đổi</button></footer>
  </section></div>;
}

function QuickCardModal({ board, cardId, onClose, onChanged }: { board: WorkflowBoard; cardId: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const card = board.cards.find((item) => item.id === cardId)!;
  const [title, setTitle] = useState(card.title);
  const [weddingDate, setWeddingDate] = useState(card.weddingDate);
  const [labelIds, setLabelIds] = useState(board.cardLabels.filter((item) => item.cardId === card.id).map((item) => item.labelId));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      if (title.trim() !== card.title || weddingDate !== card.weddingDate) await rpc("updateWorkflowCard", { cardId: card.id, title: title.trim(), note: card.note, weddingDate });
      await rpc("setWorkflowCardLabels", { cardId: card.id, labelIds });
      await onChanged(); onClose();
    } finally { setBusy(false); }
  }
  return <div className="modal-backdrop workflow-modal-backdrop" onMouseDown={onClose}><section className="workflow-quick-card-modal" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><p className="eyebrow">CÀI ĐẶT NHANH</p><h2>Thẻ công việc</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></header>
    <label>Tên thẻ<input autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
    <div className="workflow-date-field"><label>Ngày cưới<input type="date" value={weddingDate} onChange={(event) => setWeddingDate(event.target.value)} /></label><button type="button" className="secondary compact" disabled={!weddingDate || busy} onClick={() => setWeddingDate("")}>Xóa ngày</button></div>
    <section className="workflow-card-labels"><h3>Gắn nhãn</h3>{board.labels.length ? <div className="workflow-label-picker">{board.labels.map((label) => <label key={label.id} className={labelIds.includes(label.id) ? "selected" : ""} style={{ "--label-color": label.color } as React.CSSProperties}><input type="checkbox" checked={labelIds.includes(label.id)} onChange={() => setLabelIds((current) => current.includes(label.id) ? current.filter((id) => id !== label.id) : [...current, label.id])} />{label.name}</label>)}</div> : <p className="muted">Chưa có nhãn. Dùng nút bánh răng ở góc dưới phải để tạo nhãn.</p>}</section>
    <footer><button className="secondary" onClick={onClose}>Huỷ</button><button disabled={busy || !title.trim()} onClick={save}><Check size={16} /> Lưu</button></footer>
  </section></div>;
}

function LabelsModal({ board, onClose, onChanged }: { board: WorkflowBoard; onClose: () => void; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [busy, setBusy] = useState(false);
  const [labelsSectionOpen, setLabelsSectionOpen] = useState(false);
  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try { await rpc("createWorkflowLabel", { name, color }); setName(""); await onChanged(); } finally { setBusy(false); }
  }
  async function update(label: WorkflowLabel, changes: Partial<Pick<WorkflowLabel, "name" | "color">>) {
    setBusy(true);
    try { await rpc("updateWorkflowLabel", { labelId: label.id, name: changes.name ?? label.name, color: changes.color ?? label.color }); await onChanged(); } finally { setBusy(false); }
  }
  async function remove(label: WorkflowLabel) {
    if (!confirm(`Xóa nhãn “${label.name}”?`)) return;
    setBusy(true);
    try { await rpc("deleteWorkflowLabel", { labelId: label.id }); await onChanged(); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop workflow-modal-backdrop" onMouseDown={onClose}><section className="workflow-labels-modal" onMouseDown={(event) => event.stopPropagation()}>
    <header><p className="eyebrow settings-title">CÀI ĐẶT</p><button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></header>
    <section className={`settings-section ${labelsSectionOpen ? "open" : ""}`}>
      <button type="button" className="settings-section-trigger" onClick={() => setLabelsSectionOpen((open) => !open)} aria-expanded={labelsSectionOpen}><span><b>Quản lý nhãn</b><small>Tạo, đổi tên và đổi màu nhãn cho thẻ.</small></span><ChevronDown size={19} /></button>
      {labelsSectionOpen && <div className="settings-section-content">
        <div className="workflow-label-create"><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Tên nhãn mới" /><ColorPalette color={color} onChange={setColor} /><button disabled={busy || !name.trim()} onClick={create}><Plus size={16} /> Thêm nhãn</button></div>
        <div className="workflow-label-list">{board.labels.length ? board.labels.map((label) => <LabelEditor key={label.id} label={label} disabled={busy} onUpdate={update} onRemove={remove} />) : <p className="muted">Chưa có nhãn nào.</p>}</div>
      </div>}
    </section>
    <footer><button className="secondary" onClick={onClose}>Đóng</button></footer>
  </section></div>;
}

function LabelEditor({ label, disabled, onUpdate, onRemove }: { label: WorkflowLabel; disabled: boolean; onUpdate: (label: WorkflowLabel, changes: Partial<Pick<WorkflowLabel, "name" | "color">>) => Promise<void>; onRemove: (label: WorkflowLabel) => Promise<void> }) {
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  useEffect(() => { setName(label.name); setColor(label.color); }, [label]);
  return <div className="workflow-label-editor"><input aria-label={`Tên nhãn ${label.name}`} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /><ColorPalette color={color} onChange={setColor} /><button className="secondary" disabled={disabled || !name.trim() || (name === label.name && color === label.color)} onClick={() => onUpdate(label, { name: name.trim(), color })}>Lưu</button><button className="icon-button danger" disabled={disabled} onClick={() => onRemove(label)} aria-label={`Xóa nhãn ${label.name}`}><Trash2 size={15} /></button></div>;
}

function ColorPalette({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  return <div className="workflow-color-palette" aria-label="Chọn màu nhãn">{LABEL_COLORS.map((item) => <button key={item} type="button" className={color === item ? "selected" : ""} style={{ "--label-color": item } as React.CSSProperties} onClick={() => onChange(item)} aria-label={`Chọn màu ${item}`} />)}</div>;
}

function DeleteListModal({ list, lists, cardCount, onClose, onDeleted }: { list: WorkflowList; lists: WorkflowList[]; cardCount: number; onClose: () => void; onDeleted: (targetListId: string) => void }) {
  const choices = lists.filter((item) => item.id !== list.id);
  const [target, setTarget] = useState(choices[0]?.id || "");
  const needsTarget = cardCount > 0 || list.systemKey === "TODO_INBOX";
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workflow-delete-modal" onMouseDown={(event) => event.stopPropagation()}><h2>Xóa “{list.name}”?</h2>{needsTarget ? <><p>{cardCount ? `${cardCount} thẻ sẽ được chuyển sang danh sách bạn chọn.` : "Đây là danh sách nhận thẻ tự động. Hãy chọn danh sách thay thế."}</p><select value={target} onChange={(event) => setTarget(event.target.value)}>{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></> : <p>Danh sách trống sẽ bị xóa.</p>}<footer><button className="secondary" onClick={onClose}>Huỷ</button><button className="danger" disabled={needsTarget && !target} onClick={() => onDeleted(target)}>Xóa danh sách</button></footer></section></div>;
}
