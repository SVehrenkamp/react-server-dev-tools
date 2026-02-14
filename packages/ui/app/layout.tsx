import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Server DevTools",
  description: "Server-side console and network DevTools",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
