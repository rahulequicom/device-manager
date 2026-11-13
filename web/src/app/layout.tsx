import type { Metadata } from "next";
import { FeedbackToolbar } from "@/components/feedback-toolbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Device Management Admin",
  description: "Admin dashboard for the device management register"
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
