import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GradeFlow",
  description: "Homework video grading pipeline — Next.js app + Firebase Cloud Functions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
