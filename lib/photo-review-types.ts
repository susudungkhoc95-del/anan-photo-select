import type { FolderStat, Photo } from "@/lib/types";

export type ReviewBox = { x: number; y: number; width: number; height: number };
export type ReviewRegion = ReviewBox & { number: number; note: string };
export type ReviewPhotoFeedback = { note: string; regions: ReviewRegion[] };
export type ReviewFeedback = Record<string, ReviewPhotoFeedback>;

export type ReviewAlbum = {
  id: string;
  title: string;
  createdAt: string;
  downloadEnabled?: boolean;
};

export type ReviewRoundSummary = {
  number: number;
  photoCount: number;
  feedbackCount: number;
  submittedAt: string | null;
  outcome: "changes" | "approved" | null;
  folderUrl: string;
  sheetUrl?: string;
};

export type ReviewRound = Omit<ReviewRoundSummary, "folderUrl"> & {
  folders: FolderStat[];
  revision: string;
  feedback: ReviewFeedback;
};

export type ReviewPage = { photos: Photo[]; total: number };

export const REVIEW_NOTE_LIMIT = 1000;
export const REVIEW_REGION_LIMIT = 30;

export function hasReviewFeedback(feedback?: ReviewPhotoFeedback) {
  return Boolean(feedback && (feedback.note.trim() || feedback.regions.length));
}
