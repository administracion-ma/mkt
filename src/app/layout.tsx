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
            <span className="nav-logo-icon">₿</span>
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
