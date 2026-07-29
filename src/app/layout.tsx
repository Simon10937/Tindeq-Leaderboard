import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cruxboard",
  description: "Private, protocol-matched Tindeq leaderboards for climbing groups.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
