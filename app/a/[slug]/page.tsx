import App from "@/components/App";

type AlbumPageProps = { params: Promise<{ slug: string }> };

/** The id after `--` is stable; the readable title before it may change. */
export default async function AlbumPage({ params }: AlbumPageProps) {
  const { slug } = await params;
  const albumId = slug.split("--").at(-1) || "";
  return <App initialAlbumId={albumId} />;
}
