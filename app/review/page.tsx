import type { Metadata } from "next";
import PhotoReviewAdmin from "@/components/PhotoReviewAdmin";
import { isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Duyệt ảnh sửa — Quản trị ANAN Studio" };

export default async function ReviewAdminPage() {
  return <PhotoReviewAdmin initialAuthenticated={await isAdmin()} />;
}
