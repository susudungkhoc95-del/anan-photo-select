import type { Metadata } from "next";
import PhotoReviewClient from "@/components/PhotoReviewClient";
import { getReviewAlbum } from "@/lib/photo-review";

type ReviewAlbumPageProps = { params: Promise<{ albumId: string }> };

export async function generateMetadata({ params }: ReviewAlbumPageProps): Promise<Metadata> {
  const { albumId } = await params;
  const album = await getReviewAlbum(albumId).catch(() => null);
  const title = album ? `${album.title} - duyệt ảnh sửa` : "ANAN Studio — Duyệt ảnh sửa";
  const description = "Xem ảnh và gửi góp ý chỉnh sửa cho ANAN Studio.";

  return {
    title,
    description,
    openGraph: { title, type: "website" },
    twitter: { title, card: "summary" },
    robots: { index: false, follow: false },
    referrer: "no-referrer"
  };
}

export default async function ReviewAlbumPage({ params }: ReviewAlbumPageProps) {
  const { albumId } = await params;
  return <PhotoReviewClient key={albumId} albumId={albumId} />;
}
