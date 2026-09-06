"use client";

import { useEffect, useState } from "react";

const ENVIRONMENTS = {
  render: "https://anan-photo-select.onrender.com",
  vercel: "https://ananstudio.vercel.app"
} as const;

export default function EnvironmentSwitcher({ path }: { path: string }) {
  const [hostname, setHostname] = useState("");
  useEffect(() => setHostname(window.location.hostname), []);
  const onVercel = hostname.includes("vercel.app");
  return <div className="environment-switcher" aria-label="Chuyển môi trường">
    <span className="environment-switcher-label">Môi trường</span>
    <a className={!onVercel ? "active" : ""} href={`${ENVIRONMENTS.render}${path}`} target="_blank" rel="noreferrer">Render</a>
    <a className={onVercel ? "active" : ""} href={`${ENVIRONMENTS.vercel}${path}`} target="_blank" rel="noreferrer">Vercel</a>
  </div>;
}
