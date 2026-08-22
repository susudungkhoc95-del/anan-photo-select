export type FolderStat = { name: string; count: number };

export type RawReport = {
  copied: number;
  skipped: number;
  skippedNames: string[];
  missing: string[];
  checkedAt: string;
};

export type Album = {
  id: string;
  title: string;
  folderId: string;
  folderUrl: string;
  rawFolderId?: string;
  rawFolderUrl?: string;
  customerChatUrl?: string;
  rawSelectionFolderId?: string;
  rawSelectionFolderUrl?: string;
  rawLastReport?: RawReport | null;
  maxSelect: number;
  largePrintLimit: number;
  tablePrintLimit: number;
  guide: string;
  photoCount: number;
  folders: FolderStat[];
  photoSheet: string;
  spreadsheetId?: string;
  resultSheetId?: number;
  status: "active" | "archived" | "deleted";
  submittedAt?: string;
  submittedCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type Photo = {
  id: string;
  name: string;
  folder: string;
  width?: number;
  height?: number;
};

export type Selection = {
  albumId: string;
  sessionId: string;
  selectedIds: string[];
  largePrintIds: string[];
  tablePrintIds: string[];
  photoNotes: Record<string, string>;
  albumNote: string;
  submittedAt: string;
};

export type Draft = Omit<Selection, "submittedAt"> & { savedAt: string };

export type GuideTemplate = {
  id: string;
  name: string;
  guide: string;
  maxSelect: number;
  largePrintLimit: number;
  tablePrintLimit: number;
};

export type QuickLink = {
  id: string;
  label: string;
  url: string;
};

export type StudioSettings = {
  studioName: string;
  defaultGuide: string;
  defaultGuideTemplateId: string;
  guideTemplates: GuideTemplate[];
  quickLinks: QuickLink[];
};

export type WorkflowList = {
  id: string;
  workspaceId: string;
  name: string;
  position: number;
  systemKey: "TODO_INBOX" | "IN_PROGRESS" | "DONE" | "WAITING_SELECTION" | "";
  createdAt: string;
  updatedAt: string;
};

export type WorkflowCard = {
  id: string;
  workspaceId: string;
  listId: string;
  title: string;
  note: string;
  weddingDate: string;
  photoReturnDate: string;
  position: number;
  source: "manual" | "dp_select";
  dpSelectAlbumId: string;
  dpSelectSubmissionId: string;
  selectionSubmittedAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  createdBy: string;
  dpSummary: string;
  dpAlbumNote: string;
  dpPhotoNoteCount: number;
};

export type WorkflowLabel = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowCardLabel = {
  id: string;
  workspaceId: string;
  cardId: string;
  labelId: string;
  createdAt: string;
};

export type WorkflowLink = {
  id: string;
  workspaceId: string;
  cardId: string;
  label: string;
  url: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowActivity = {
  id: string;
  workspaceId: string;
  cardId: string;
  activityType: string;
  description: string;
  oldValue: string;
  newValue: string;
  actorId: string;
  actorName: string;
  source: "manual" | "dp_select";
  createdAt: string;
};

export type WorkflowBoard = {
  workspaceId: string;
  lists: WorkflowList[];
  cards: WorkflowCard[];
  links: WorkflowLink[];
  activities: WorkflowActivity[];
  labels: WorkflowLabel[];
  cardLabels: WorkflowCardLabel[];
};

export const DEFAULT_GUIDE =
  'Quý khách bấm vào biểu tượng trái tim trên ảnh muốn chọn.\nTrong gói của mình sẽ chọn tổng 40 ảnh để chỉnh sửa.\n  - 2 ảnh phóng to 60x90\n  - 10 ảnh để bàn\n  - 28 ảnh sửa file mềm\n* Tất cả 40 ảnh chọn sẽ được đưa vào làm video slide.\nKhi chọn xong, bấm "Gửi ảnh chọn"';

export const DEFAULT_STUDIO_NAME = "ANAN STUDIO";
