"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Check, ExternalLink, GripVertical, Link as LinkIcon, Plus, Search, Trash2, X } from "lucide-react";
import { rpc } from "@/components/App";
import type { WorkflowBoard, WorkflowCard, WorkflowLink, WorkflowList } from "@/lib/types";
import { workflowAge, workflowCardMatches } from "@/lib/workflow-utils";

type ModalState = { cardId: string } | null;

function formatTime(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

export default function WorkflowView() {
  const [auth, setAuth] = useState<"loading" | "yes" | "no">("loading");
  const [board, setBoard] = useState<WorkflowBoard | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [cardModal, setCardModal] = useState<ModalState>(null);
  const [deleteList, setDeleteList] = useState<WorkflowList | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function load() {
    try { setBoard(await rpc<WorkflowBoard>("getWorkflowBoard")); }
    catch (error) { setMessage((error as Error).message); }
  }

  useEffect(() => { fetch("/api/auth").then((response) => response.json()).then(({ authenticated }) => setAuth(authenticated ? "yes" : "no")); }, []);
  useEffect(() => { if (auth === "yes") void load(); }, [auth]);

  const filtered = useMemo(() => {
    if (!board || !query.trim()) return board?.cards || [];
    return board.cards.filter((card) => workflowCardMatches(card, board.links.filter((link) => link.cardId === card.id), query));
  }, [board, query]);

  async function addList() {
    const name = window.prompt("Tên danh sách mới:");
    if (!name?.trim()) return;
    try { await rpc("createWorkflowList", { name }); await load(); } catch (error) { setMessage((error as Error).message); }
  }

  async function renameList(list: WorkflowList) {
    const name = window.prompt("Đổi tên danh sách:", list.name);
    if (name === null) return;
    try { await rpc("updateWorkflowList", { listId: list.id, name }); await load(); } catch (error) { setMessage((error as Error).message); }
  }

  async function addCard(list: WorkflowList) {
    const title = window.prompt("Tên thẻ:");
    if (!title?.trim()) return;
    try { await rpc("createWorkflowCard", { listId: list.id, title }); await load(); } catch (error) { setMessage((error as Error).message); }
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
        const cards = [...board.cards.filter((item) => item.listId !== card.listId && item.listId !== targetListId), ...sourceCards, ...targetCards];
        setBoard({ ...board, cards });
        await rpc("moveWorkflowCard", { cardId, targetListId, orderedIds: targetCards.map((item) => item.id), sourceOrderedIds: sourceCards.map((item) => item.id) });
      }
    } catch (error) { setMessage((error as Error).message); await load(); }
  }

  if (auth === "loading" || !board) return <div className="page-loader"><span className="spinner" /> Đang mở DP Workflow…</div>;
  if (auth === "no") {
    if (typeof window !== "undefined") window.location.replace("/");
    return <div className="page-loader">Đang chuyển đến trang đăng nhập…</div>;
  }

  return <main className="workflow-page">
    <header className="workflow-header">
      <a className="secondary btn-icon" href="/"><ArrowLeft size={17} /> DP Select</a>
      <div><p className="eyebrow">QUẢN LÝ HẬU KỲ</p><h1>DP Workflow</h1></div>
      <div className="workflow-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Tìm kiếm thẻ..." />{query && <button className="icon-button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={16} /></button>}</div>
    </header>
    {message && <div className="workflow-message notice">{message}<button className="text-button" onClick={() => setMessage("")}>Đóng</button></div>}
    {query && <p className="workflow-search-note">Xóa tìm kiếm để sắp xếp thẻ.</p>}
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={board.lists.map((list) => `list-${list.id}`)} strategy={horizontalListSortingStrategy}>
        <div className="workflow-board">
          {board.lists.map((list) => <WorkflowColumn key={list.id} list={list} cards={filtered.filter((card) => card.listId === list.id)} links={board.links} searching={Boolean(query)} onAdd={() => addCard(list)} onOpen={(cardId) => setCardModal({ cardId })} onRename={() => renameList(list)} onDelete={() => setDeleteList(list)} />)}
          <button className="workflow-add-list" onClick={addList}><Plus size={18} /> Thêm danh sách</button>
        </div>
      </SortableContext>
      <DragOverlay />
    </DndContext>
    {cardModal && <CardModal board={board} cardId={cardModal.cardId} onClose={() => setCardModal(null)} onChanged={load} />}
    {deleteList && <DeleteListModal list={deleteList} lists={board.lists} cardCount={board.cards.filter((card) => card.listId === deleteList.id).length} onClose={() => setDeleteList(null)} onDeleted={async (targetListId) => { try { await rpc("deleteWorkflowList", { listId: deleteList.id, targetListId }); setDeleteList(null); await load(); } catch (error) { setMessage((error as Error).message); } }} />}
  </main>;
}

function WorkflowColumn({ list, cards, links, searching, onAdd, onOpen, onRename, onDelete }: { list: WorkflowList; cards: WorkflowCard[]; links: WorkflowLink[]; searching: boolean; onAdd: () => void; onOpen: (id: string) => void; onRename: () => void; onDelete: () => void }) {
  const sortable = useSortable({ id: `list-${list.id}`, data: { type: "list" } });
  const droppable = useDroppable({ id: `column-${list.id}`, data: { type: "column" } });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return <section ref={(node) => { sortable.setNodeRef(node); droppable.setNodeRef(node); }} style={style} className={`workflow-column ${sortable.isDragging ? "dragging" : ""}`}>
    <header><button className="workflow-grip" {...sortable.attributes} {...sortable.listeners} aria-label="Kéo danh sách"><GripVertical size={18} /></button><div><h2>{list.name}</h2><span>{cards.length} thẻ</span></div><details><summary aria-label="Menu danh sách">•••</summary><button onClick={onRename}>Đổi tên</button><button onClick={onDelete}>Xóa danh sách</button></details></header>
    <SortableContext items={cards.map((card) => `card-${card.id}`)} strategy={rectSortingStrategy}>
      <div className="workflow-cards">{cards.map((card) => <WorkflowCardItem key={card.id} card={card} list={list} links={links.filter((link) => link.cardId === card.id)} onOpen={() => onOpen(card.id)} />)}{!cards.length && <p className="workflow-empty">{searching ? "Không có kết quả" : "Chưa có thẻ"}</p>}</div>
    </SortableContext>
    {!searching && <button className="workflow-add-card" onClick={onAdd}><Plus size={17} /> Thêm thẻ</button>}
  </section>;
}

function WorkflowCardItem({ card, list, links, onOpen }: { card: WorkflowCard; list: WorkflowList; links: WorkflowLink[]; onOpen: () => void }) {
  const sortable = useSortable({ id: `card-${card.id}`, data: { type: "card" } });
  const age = workflowAge(card, list);
  return <article ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className={`workflow-card ${sortable.isDragging ? "dragging" : ""}`} {...sortable.attributes} {...sortable.listeners} onClick={onOpen}>
    <h3>{card.title}</h3>{card.note && <p>{card.note}</p>}
    <footer><span className={`workflow-age ${age.level}`}>{age.label}</span>{links.length > 0 && <span><LinkIcon size={13} /> {links.length}</span>}</footer>
  </article>;
}

function CardModal({ board, cardId, onClose, onChanged }: { board: WorkflowBoard; cardId: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const card = board.cards.find((item) => item.id === cardId)!;
  const list = board.lists.find((item) => item.id === card.listId)!;
  const [title, setTitle] = useState(card.title);
  const [note, setNote] = useState(card.note);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const links = board.links.filter((item) => item.cardId === card.id);
  const activities = board.activities.filter((item) => item.cardId === card.id);
  const age = workflowAge(card, list);
  async function save() { setBusy(true); try { await rpc("updateWorkflowCard", { cardId: card.id, title, note }); await onChanged(); onClose(); } finally { setBusy(false); } }
  async function addLink() { if (!label.trim() || !url.trim()) return; setBusy(true); try { await rpc("createWorkflowLink", { cardId: card.id, label, url }); setLabel(""); setUrl(""); await onChanged(); } finally { setBusy(false); } }
  async function editLink(link: WorkflowLink) { const nextLabel = window.prompt("Tên hiển thị:", link.label); if (nextLabel === null) return; const nextUrl = window.prompt("URL:", link.url); if (nextUrl === null) return; await rpc("updateWorkflowLink", { linkId: link.id, label: nextLabel, url: nextUrl }); await onChanged(); }
  async function removeLink(linkId: string) { if (!confirm("Xóa link này?")) return; await rpc("deleteWorkflowLink", { linkId }); await onChanged(); }
  async function removeCard() { if (!confirm("Xóa thẻ này cùng toàn bộ link và lịch sử?")) return; await rpc("deleteWorkflowCard", { cardId: card.id }); await onChanged(); onClose(); }
  return <div className="modal-backdrop workflow-modal-backdrop" onMouseDown={onClose}><section className="workflow-modal" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><p className="eyebrow">{card.source === "dp_select" ? "TỪ DP SELECT" : "THẺ THỦ CÔNG"}</p><h2>Chi tiết thẻ</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></header>
    <label>Tên thẻ<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
    <div className="workflow-time"><span>Khách gửi ảnh: <b>{formatTime(card.selectionSubmittedAt)}</b></span><span>Thẻ tạo: <b>{formatTime(card.createdAt)}</b></span><span className={age.level}>Trạng thái: <b>{age.label}</b></span><span>Cập nhật: <b>{formatTime(card.updatedAt)}</b></span>{card.completedAt && <span>Hoàn thành: <b>{formatTime(card.completedAt)}</b></span>}</div>
    <label>Ghi chú<textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <section className="workflow-links"><h3>Đường link</h3>{links.map((link) => <div key={link.id} className="workflow-link"><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink size={14} /></a><span><button className="text-button" onClick={() => editLink(link)}>Sửa</button><button className="text-button danger" onClick={() => removeLink(link.id)}>Xóa</button></span></div>)}<div className="workflow-new-link"><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Tên link" /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." /><button className="secondary" disabled={busy} onClick={addLink}><Plus size={16} /> Thêm link</button></div></section>
    <section className="workflow-activity"><h3>Lịch sử hoạt động</h3>{activities.length ? activities.map((item) => <p key={item.id}><time>{formatTime(item.createdAt)}</time>{item.description}</p>) : <p className="muted">Chưa có hoạt động.</p>}</section>
    <footer><button className="danger" onClick={removeCard}><Trash2 size={16} /> Xóa thẻ</button><span /><button className="secondary" onClick={onClose}>Đóng</button><button disabled={busy} onClick={save}><Check size={16} /> Lưu thay đổi</button></footer>
  </section></div>;
}

function DeleteListModal({ list, lists, cardCount, onClose, onDeleted }: { list: WorkflowList; lists: WorkflowList[]; cardCount: number; onClose: () => void; onDeleted: (targetListId: string) => void }) {
  const choices = lists.filter((item) => item.id !== list.id);
  const [target, setTarget] = useState(choices[0]?.id || "");
  const needsTarget = cardCount > 0 || list.systemKey === "TODO_INBOX";
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workflow-delete-modal" onMouseDown={(event) => event.stopPropagation()}><h2>Xóa “{list.name}”?</h2>{needsTarget ? <><p>{cardCount ? `${cardCount} thẻ sẽ được chuyển sang danh sách bạn chọn.` : "Đây là danh sách nhận thẻ tự động. Hãy chọn danh sách thay thế."}</p><select value={target} onChange={(event) => setTarget(event.target.value)}>{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></> : <p>Danh sách trống sẽ bị xóa.</p>}<footer><button className="secondary" onClick={onClose}>Huỷ</button><button className="danger" disabled={needsTarget && !target} onClick={() => onDeleted(target)}>Xóa danh sách</button></footer></section></div>;
}
