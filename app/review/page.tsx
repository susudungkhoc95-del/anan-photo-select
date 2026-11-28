import type { Metadata } from "next";
import PhotoReviewAdmin from "@/components/PhotoReviewAdmin";
import { isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Duyệt ảnh sửa — Quản trị ANAN Studio" };

export default async function ReviewAdminPage({ searchParams }: {
  searchParams: Promise<{ album?: string | string[]; round?: string | string[] }>;
}) {
  const { album, round } = await searchParams;
  const albumId = typeof album === "string" && /^[\w-]{36}$/.test(album) ? album : undefined;
  const roundNumber = typeof round === "string" ? Number(round) : NaN;
  return <PhotoReviewAdmin initialAuthenticated={await isAdmin()} initialAlbumId={albumId}
    initialRound={Number.isSafeInteger(roundNumber) && roundNumber > 0 ? roundNumber : undefined} />;
}
