"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Panel" },
  { href: "/calendar", label: "Calendario" },
  { href: "/analytics", label: "Analítica" },
  { href: "/ads", label: "Meta Ads" },
  { href: "/resumenes", label: "Resúmenes" },
  { href: "/settings", label: "Ficha de marca" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <div className="nav-links">
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className={`nav-link${active ? " active" : ""}`}>
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
