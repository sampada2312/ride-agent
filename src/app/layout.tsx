import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ride-Agent",
  description: "AI ride booking demo with adapter-driven tools and confirmation safety gate."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
