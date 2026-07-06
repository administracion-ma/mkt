import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CoinBox Marketing",
  description: "Calendario y analítica de contenido Instagram para CoinBox Mining",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const account = await getConnectedAccount();

  return (
    <html lang="es" className={geistSans.variable}>
      <body>
        <nav className="nav">
          <Link href="/" className="nav-logo">
            <svg
              className="nav-logo-icon"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              aria-hidden="true"
            >
              <path d="M12 1L22 6.5V17.5L12 23L2 17.5V6.5L12 1Z" fill="var(--accent)" opacity="0.18" />
              <path d="M12 1L22 6.5L12 12L2 6.5L12 1Z" fill="var(--accent)" />
              <path d="M2 6.5L12 12V23L2 17.5V6.5Z" fill="var(--accent)" opacity="0.5" />
              <path d="M22 6.5L12 12V23L22 17.5V6.5Z" fill="var(--accent)" opacity="0.8" />
            </svg>
            CoinBox Marketing
          </Link>
          <NavLinks />
          {account && (
            <div className="nav-account">
              <span className="nav-account-dot" />
              @{account.igUsername}
            </div>
          )}
        </nav>
        {children}
      </body>
    </html>
  );
}
