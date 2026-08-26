import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VedaAI — AI Assessment Evaluator",
  description: "Upload question papers and answer sheets to automatically extract, map, and grade student answers using AI.",
  keywords: "AI assessment, answer extraction, question mapping, automated grading, teacher tool",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "VedaAI — AI Assessment Evaluator",
    description: "Automated question extraction, answer mapping and grading for teachers.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
