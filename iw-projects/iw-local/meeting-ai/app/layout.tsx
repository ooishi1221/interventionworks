import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "meeting-ai | リアルタイムAI議事録",
  description: "会議をリアルタイムで文字起こし・要約・AI壁打ち",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="dark">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
