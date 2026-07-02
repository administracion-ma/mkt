"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/calendar", label: "Calendario" },
  { href: "/analytics", label: "Analítica" },
  { href: "/settings", label: "Ficha de marca" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <div className="nav-links">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`nav-link${pathname.startsWith(link.href) ? " active" : ""}`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
