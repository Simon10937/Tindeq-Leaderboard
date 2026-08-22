import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Tindeq Tracker",
  description: "A local-first tracker for Tindeq Endurance and Repeater CSV exports.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
