import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Мастерская CRM",
  description: "CRM для сервисных центров и ремонтных мастерских",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
