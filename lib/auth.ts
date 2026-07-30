import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "anan_admin";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("Thiếu SESSION_SECRET.");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionValue() {
  const expires = Date.now() + MAX_AGE * 1000;
  const payload = String(expires);
  return `${payload}.${sign(payload)}`;
}

export function verifySessionValue(value?: string) {
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  const expected = sign(expires);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function isAdmin() {
  const store = await cookies();
  return verifySessionValue(store.get(COOKIE_NAME)?.value);
}

export const adminCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE
  }
};
