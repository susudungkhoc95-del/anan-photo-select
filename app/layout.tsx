import type { Metadata } from "next";
import { Be_Vietnam_Pro, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const sans = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const serif = Cormorant_Garamond({ subsets: ["vietnamese", "latin"], weight: ["500", "600", "700"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "ANAN Studio — Chọn ảnh",
  description: "Không gian chọn ảnh riêng dành cho khách hàng ANAN Studio.",
  icons: {
    icon: [{ url: "/dp-logo.png", type: "image/png" }],
    apple: [{ url: "/dp-logo.png", type: "image/png" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
