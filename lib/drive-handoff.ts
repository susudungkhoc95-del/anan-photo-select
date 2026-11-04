/** Only Google Drive folder URLs can be sent to DP drive. */
export function dpDriveDownloadUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "drive.google.com" || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,128})\/?$/);
    if (!match) return null;
    return `dpdrive://download?folder=${encodeURIComponent(match[1])}`;
  } catch { return null; }
}
