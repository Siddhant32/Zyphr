import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zyphr — Your Practicals. Your Details. Your PDF.",
  description:
    "Choose your practical, add your details, and download your personalized PDF.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
