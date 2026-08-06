import App from "@/components/App";
import type { Metadata } from "next";
import { getAlbum } from "@/lib/google";

type AlbumPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: AlbumPageProps): Promise<Metadata> {
  const { slug } = await params;
  const albumId = decodeURIComponent(slug.split("--").at(-1) || "");
  try {
    const album = await getAlbum(albumId);
    const title = `${album.title} — Chọn ảnh`;
    const description = `Không gian chọn ảnh dành cho album ${album.title}.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        url: `/a/${slug}`,
        images: [{ url: "/dp-logo.png", width: 810, height: 810, alt: "ANAN Studio" }]
      },
      twitter: { card: "summary", title, description, images: ["/dp-logo.png"] }
    };
  } catch {
    return {};
  }
}

/** The id after `--` is stable; the readable title before it may change. */
export default async function AlbumPage({ params }: AlbumPageProps) {
  const { slug } = await params;
  const albumId = slug.split("--").at(-1) || "";
  return <App initialAlbumId={albumId} />;
}
