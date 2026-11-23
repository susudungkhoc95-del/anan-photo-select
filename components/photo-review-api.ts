export class ReviewRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function reviewRequest<T>(
  action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal
): Promise<T> {
  const response = await fetch("/api/review", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }), signal
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new ReviewRequestError(json.error || "Không kết nối được với máy chủ.", response.status);
  return json.data as T;
}
