import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Protección contra "version skew": cada deploy cambia los IDs internos de
  // las server actions, así que una pestaña abierta de la versión anterior
  // rompía la página entera al primer click ("This page couldn't load"). Con
  // un deploymentId, Next detecta que el cliente es de otra versión y recarga
  // la página sola en vez de fallar. VERCEL_DEPLOYMENT_ID lo setea Vercel en
  // cada build; en local queda undefined y no hace nada.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
};

export default nextConfig;
