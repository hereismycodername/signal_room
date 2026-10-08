import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project: Untitled — Collective Dating Story",
  description: "A light everyday dating story where the audience chooses what happens next.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
