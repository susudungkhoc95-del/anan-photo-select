"use client";

import type { QuickLink } from "@/lib/types";

export default function QuickLinks({ links }: { links: QuickLink[] }) {
  if (!links.length) return null;
  return <nav className="quick-links" aria-label="Truy cập nhanh">
    {links.map((link) => <a className="secondary quick-link" href={link.url} target="_blank" rel="noreferrer" key={link.id}><img src="/google-drive-modern.png" alt="" /> {link.label}</a>)}
  </nav>;
}
