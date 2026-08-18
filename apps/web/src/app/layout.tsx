import type { ReactNode } from "react";

import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata = {
  title: "Contact Vault",
  description: "Contact management with OSINT report ingestion",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
