import type { Metadata } from "next";
import PhotoReviewClient from "@/components/PhotoReviewClient";

export const metadata: Metadata = {
  title: "ANAN Studio — Duyệt ảnh sửa",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};

export default async function ReviewAlbumPage({ params }: { params: Promise<{ albumId: string }> }) {
  const { albumId } = await params;
  return <PhotoReviewClient key={albumId} albumId={albumId} />;
}
