import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "mkt_auth";

// Traba simple de acceso: una contraseña compartida por el equipo, no cuentas
// individuales. El objetivo es que no cualquiera con el link entre a ver
// gasto de pauta o tocar /admin — no reemplaza un sistema de usuarios real.
const PUBLIC_PATHS = ["/login", "/privacy"];

// Next.js 16 renombró "Middleware" a "Proxy" (mismo mecanismo, solo cambia
// el nombre de archivo/función) — este chequeo es optimista, solo lee la
// cookie, sin tocar la base, tal como recomienda la guía de autenticación.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const authed = req.cookies.get(COOKIE_NAME)?.value === process.env.APP_PASSWORD;

  if (!authed && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (authed && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
