import type { ReactNode } from "react";

export const metadata = {
  title: "Contact Vault",
  description: "Contact management with OSINT report ingestion",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
