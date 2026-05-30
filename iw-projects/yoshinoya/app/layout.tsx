import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "チェックリスト作成ツール",
  description: "テンプレートから作成してExcelに出力できるチェックリストツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* ダークモード早期適用（flash防止） */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var s = localStorage.getItem('yoshinoya_dark');
            var sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (s !== null ? s === 'true' : sys) document.documentElement.classList.add('dark');
          } catch(e) {}
        `}} />
        {children}
      </body>
    </html>
  );
}
