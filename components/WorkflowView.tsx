"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, ExternalLink, Link as LinkIcon, MoreVertical, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { rpc } from "@/components/App";
import type { WorkflowBoard, WorkflowCard, WorkflowLabel, WorkflowLink, WorkflowList } from "@/lib/types";
import { normalizeWorkflowText, workflowAge, workflowCardMatches } from "@/lib/workflow-utils";

type ModalState = { cardId: string } | null;
type CreateState = { type: "list" } | { type: "card"; list: WorkflowList } | null;
const LABEL_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

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
  const [createModal, setCreateModal] = useState<CreateState>(null);
  const [deleteList, setDeleteList] = useState<WorkflowList | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [quickCardId, setQuickCardId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function load() {
    try { setBoard(await rpc<WorkflowBoard>("getWorkflowBoard")); }
    catch (error) { setMessage((error as Error).message); }
  }

  useEffect(() => {
    document.body.classList.add("admin-mode");
    document.body.classList.remove("admin-light-mode");
    return () => document.body.classList.remove("admin-mode", "admin-light-mode");
  }, []);
  useEffect(() => { fetch("/api/auth").then((response) => response.json()).then(({ authenticated }) => setAuth(authenticated ? "yes" : "no")); }, []);
  useEffect(() => { if (auth === "yes") void load(); }, [auth]);

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
    try { await rpc("createWorkflowCard", { listId: list.id, title }); setCreateModal(null); await load(); } catch (error) { setMessage((error as Error).message); }
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
          {board.lists.map((list) => <WorkflowColumn key={list.id} list={list} cards={filtered.filter((card) => card.listId === list.id)} links={board.links} labels={board.labels} cardLabelIds={board.cardLabels} searching={Boolean(query)} onAdd={() => setCreateModal({ type: "card", list })} onOpen={(cardId) => setCardModal({ cardId })} onQuickEdit={setQuickCardId} onRename={() => renameList(list)} onDelete={() => setDeleteList(list)} />)}
          <button type="button" className="workflow-add-list" onClick={() => setCreateModal({ type: "list" })}><Plus size={18} /> Thêm danh sách</button>
        </div>
      </SortableContext>
      <DragOverlay>{activeDragId?.startsWith("card-") && <WorkflowCardPreview card={board.cards.find((card) => `card-${card.id}` === activeDragId)} />}{activeDragId?.startsWith("list-") && <WorkflowListPreview list={board.lists.find((list) => `list-${list.id}` === activeDragId)} />}</DragOverlay>
    </DndContext>
    {cardModal && <CardModal board={board} cardId={cardModal.cardId} onClose={() => setCardModal(null)} onChanged={load} />}
    {quickCardId && <QuickCardModal board={board} cardId={quickCardId} onClose={() => setQuickCardId(null)} onChanged={load} />}
    {labelsOpen && <LabelsModal board={board} onClose={() => setLabelsOpen(false)} onChanged={load} />}
    {createModal && <CreateWorkflowModal state={createModal} onClose={() => setCreateModal(null)} onCreate={(value) => createModal.type === "list" ? addList(value) : addCard(createModal.list, value)} />}
    {deleteList && <DeleteListModal list={deleteList} lists={board.lists} cardCount={board.cards.filter((card) => card.listId === deleteList.id).length} onClose={() => setDeleteList(null)} onDeleted={async (targetListId) => { try { await rpc("deleteWorkflowList", { listId: deleteList.id, targetListId }); setDeleteList(null); await load(); } catch (error) { setMessage((error as Error).message); } }} />}
    <button type="button" className="secondary settings-fab workflow-settings-fab" onClick={() => setLabelsOpen((open) => !open)} aria-label={labelsOpen ? "Đóng cài đặt Workflow" : "Cài đặt Workflow"}><Settings size={19} /></button>
  </main>;
}

function WorkflowColumn({ list, cards, links, labels, cardLabelIds, searching, onAdd, onOpen, onQuickEdit, onRename, onDelete }: { list: WorkflowList; cards: WorkflowCard[]; links: WorkflowLink[]; labels: WorkflowLabel[]; cardLabelIds: WorkflowBoard["cardLabels"]; searching: boolean; onAdd: () => void; onOpen: (id: string) => void; onQuickEdit: (id: string) => void; onRename: () => void; onDelete: () => void }) {
  const sortable = useSortable({ id: `list-${list.id}`, data: { type: "list" } });
  const droppable = useDroppable({ id: `column-${list.id}`, data: { type: "column" } });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return <section ref={(node) => { sortable.setNodeRef(node); droppable.setNodeRef(node); }} style={style} className={`workflow-column ${sortable.isDragging ? "dragging" : ""}`}>
    <header><div><h2 className="workflow-list-title" {...sortable.attributes} {...sortable.listeners} title="Giữ để kéo danh sách">{list.name}</h2><span>{cards.length} thẻ</span></div><details><summary aria-label="Menu danh sách">•••</summary><button onClick={onRename}>Đổi tên</button><button onClick={onDelete}>Xóa danh sách</button></details></header>
    <SortableContext items={cards.map((card) => `card-${card.id}`)} strategy={rectSortingStrategy}>
      <div className="workflow-cards">{cards.map((card) => <WorkflowCardItem key={card.id} card={card} list={list} links={links.filter((link) => link.cardId === card.id)} labels={labels.filter((label) => cardLabelIds.some((assignment) => assignment.cardId === card.id && assignment.labelId === label.id))} onOpen={() => onOpen(card.id)} onQuickEdit={() => onQuickEdit(card.id)} />)}{!cards.length && <p className="workflow-empty">{searching ? "Không có kết quả" : "Chưa có thẻ"}</p>}</div>
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

function WorkflowCardItem({ card, list, links, labels, onOpen, onQuickEdit }: { card: WorkflowCard; list: WorkflowList; links: WorkflowLink[]; labels: WorkflowLabel[]; onOpen: () => void; onQuickEdit: () => void }) {
  const sortable = useSortable({ id: `card-${card.id}`, data: { type: "card" } });
  const age = workflowAge(card, list);
  return <article ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className={`workflow-card ${sortable.isDragging ? "dragging" : ""}`} {...sortable.attributes} {...sortable.listeners} onClick={onOpen}>
    <button type="button" className="icon-button workflow-card-menu" aria-label={`Cài đặt nhanh ${card.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onQuickEdit(); }}><MoreVertical size={17} /></button>
    <h3>{card.title}</h3>{card.note && <p>{card.note}</p>}
    <footer><span className={`workflow-age ${age.level}`}>{age.label}</span>{labels.length > 0 && <div className="workflow-label-chips">{labels.map((label) => <span key={label.id} style={{ "--label-color": label.color } as React.CSSProperties}>{label.name}</span>)}</div>}{links.length > 0 && <span><LinkIcon size={13} /> {links.length}</span>}</footer>
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
  const selectedLabelIds = board.cardLabels.filter((item) => item.cardId === card.id).map((item) => item.labelId);
  const age = workflowAge(card, list);
  async function save() { setBusy(true); try { await rpc("updateWorkflowCard", { cardId: card.id, title, note }); await onChanged(); onClose(); } finally { setBusy(false); } }
  async function addLink() { if (!label.trim() || !url.trim()) return; setBusy(true); try { await rpc("createWorkflowLink", { cardId: card.id, label, url }); setLabel(""); setUrl(""); await onChanged(); } finally { setBusy(false); } }
  async function editLink(link: WorkflowLink) { const nextLabel = window.prompt("Tên hiển thị:", link.label); if (nextLabel === null) return; const nextUrl = window.prompt("URL:", link.url); if (nextUrl === null) return; await rpc("updateWorkflowLink", { linkId: link.id, label: nextLabel, url: nextUrl }); await onChanged(); }
  async function removeLink(linkId: string) { if (!confirm("Xóa link này?")) return; await rpc("deleteWorkflowLink", { linkId }); await onChanged(); }
  async function removeCard() { if (!confirm("Xóa thẻ này cùng toàn bộ link và lịch sử?")) return; await rpc("deleteWorkflowCard", { cardId: card.id }); await onChanged(); onClose(); }
  async function toggleLabel(labelId: string) {
    setBusy(true);
    try {
      const next = selectedLabelIds.includes(labelId) ? selectedLabelIds.filter((id) => id !== labelId) : [...selectedLabelIds, labelId];
      await rpc("setWorkflowCardLabels", { cardId: card.id, labelIds: next });
      await onChanged();
    } finally { setBusy(false); }
  }
  return <div className="modal-backdrop workflow-modal-backdrop" onMouseDown={onClose}><section className="workflow-modal" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><p className="eyebrow">{card.source === "dp_select" ? "TỪ DP SELECT" : "THẺ THỦ CÔNG"}</p><h2>Chi tiết thẻ</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></header>
    <label>Tên thẻ<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
    <div className="workflow-time"><span>Khách gửi ảnh: <b>{formatTime(card.selectionSubmittedAt)}</b></span><span>Thẻ tạo: <b>{formatTime(card.createdAt)}</b></span><span className={age.level}>Trạng thái: <b>{age.label}</b></span><span>Cập nhật: <b>{formatTime(card.updatedAt)}</b></span>{card.completedAt && <span>Hoàn thành: <b>{formatTime(card.completedAt)}</b></span>}</div>
    <section className="workflow-links"><h3>Đường link</h3>{links.map((link) => <div key={link.id} className="workflow-link"><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink size={14} /></a><span><button className="text-button" onClick={() => editLink(link)}>Sửa</button><button className="text-button danger" onClick={() => removeLink(link.id)}>Xóa</button></span></div>)}<div className="workflow-new-link"><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Tên link" /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." /><button className="secondary" disabled={busy} onClick={addLink}><Plus size={16} /> Thêm link</button></div></section>
    <label>Ghi chú<textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    {card.dpSummary && <section className="workflow-dp-info"><h3>Tóm tắt DP Select</h3><p>{card.dpSummary}</p></section>}
    <section className="workflow-card-labels"><h3>Nhãn</h3>{board.labels.length ? <div className="workflow-label-picker">{board.labels.map((label) => <label key={label.id} className={selectedLabelIds.includes(label.id) ? "selected" : ""} style={{ "--label-color": label.color } as React.CSSProperties}><input type="checkbox" checked={selectedLabelIds.includes(label.id)} disabled={busy} onChange={() => toggleLabel(label.id)} />{label.name}</label>)}</div> : <p className="muted">Chưa có nhãn. Bấm nút Nhãn ở đầu trang để tạo nhãn.</p>}</section>
    <section className="workflow-activity"><h3>Lịch sử hoạt động</h3>{activities.length ? activities.map((item) => <p key={item.id}><time>{formatTime(item.createdAt)}</time>{item.description}</p>) : <p className="muted">Chưa có hoạt động.</p>}</section>
    <footer><button className="danger" onClick={removeCard}><Trash2 size={16} /> Xóa thẻ</button><span /><button className="secondary" onClick={onClose}>Đóng</button><button disabled={busy} onClick={save}><Check size={16} /> Lưu thay đổi</button></footer>
  </section></div>;
}

function QuickCardModal({ board, cardId, onClose, onChanged }: { board: WorkflowBoard; cardId: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const card = board.cards.find((item) => item.id === cardId)!;
  const [title, setTitle] = useState(card.title);
  const [labelIds, setLabelIds] = useState(board.cardLabels.filter((item) => item.cardId === card.id).map((item) => item.labelId));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      if (title.trim() !== card.title) await rpc("updateWorkflowCard", { cardId: card.id, title: title.trim(), note: card.note });
      await rpc("setWorkflowCardLabels", { cardId: card.id, labelIds });
      await onChanged(); onClose();
    } finally { setBusy(false); }
  }
  return <div className="modal-backdrop workflow-modal-backdrop" onMouseDown={onClose}><section className="workflow-quick-card-modal" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><p className="eyebrow">CÀI ĐẶT NHANH</p><h2>Thẻ công việc</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></header>
    <label>Tên thẻ<input autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
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
