import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/instagram/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
