"use client";

import { useEffect, useState } from "react";
import AdminView from "@/components/AdminView";
import ClientView from "@/components/ClientView";

export type RpcError = Error & { status?: number };

export async function rpc<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error || "Không thể kết nối máy chủ.") as RpcError;
    error.status = response.status;
    throw error;
  }
  return json.data as T;
}

export default function App() {
  const [albumId, setAlbumId] = useState<string | null>(null);
  useEffect(() => {
    setAlbumId(new URLSearchParams(window.location.search).get("album") || "");
  }, []);
  if (albumId === null) return <div className="page-loader"><span className="spinner" /> Đang mở không gian ảnh…</div>;
  return albumId ? <ClientView albumId={albumId} /> : <AdminView />;
}
