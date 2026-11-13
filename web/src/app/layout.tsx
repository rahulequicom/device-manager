import type { Metadata } from "next";
import { FeedbackToolbar } from "@/components/feedback-toolbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Device Management",
  description: "Employee devices, registration and transfers"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}<FeedbackToolbar /></body>
    </html>
  );
}
