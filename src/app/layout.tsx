import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Room — Forecast what matters",
  description:
    "Private probability forecasts, transparent resolution, and a verifiable track record of accuracy.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
