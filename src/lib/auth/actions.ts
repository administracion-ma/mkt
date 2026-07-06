"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";

const COOKIE_NAME = "mkt_auth";

export async function login(formData: FormData): Promise<{ ok: boolean; message: string } | undefined> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (password !== env.appPassword) {
    return { ok: false, message: "Contraseña incorrecta." };
  }

  const store = await cookies();
  store.set(COOKIE_NAME, password, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });

  redirect(next.startsWith("/") ? next : "/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
  redirect("/login");
}
