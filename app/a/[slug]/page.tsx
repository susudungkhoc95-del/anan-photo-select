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
        // Messenger requires an image URL before it reliably renders the OG title.
        // This transparent placeholder activates the preview without showing an app logo.
        images: [{ url: "/og-preview.svg", width: 1200, height: 630, alt: "" }]
      },
      twitter: { card: "summary", title, description, images: ["/og-preview.svg"] }
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
