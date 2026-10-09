import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "@venue-rwa/ui/styles.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });

export const metadata: Metadata = { title: "OpenGrounds PoS · Point of Sale venue olahraga", description: "Booking sesi, tagihan otomatis, dan ledger append-only untuk venue olahraga" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
