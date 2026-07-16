// Conclusiones automáticas para /youtube — mismo espíritu que key-insights.ts
// (Instagram) y ads-key-insights.ts: sin IA, instantáneas, orientadas a qué
// hacer distinto, no a repetir los números de la grilla.
import type { KeyInsight } from "@/lib/key-insights";
import type { YoutubeGridRow } from "@/components/YoutubeVideoGrid";
import { median } from "@/lib/benchmark";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function buildYoutubeKeyInsights(args: {
  rows: YoutubeGridRow[];
  subsNow: number | null;
  subsPrev: number | null; // snapshot de ~1 semana atrás, null si no hay historial
}): KeyInsight[] {
  const { rows, subsNow, subsPrev } = args;
  const insights: KeyInsight[] = [];
  const now = new Date().getTime();

  // 1. Cadencia — sin publicaciones no hay nada que optimizar
  const lastPublished = rows
    .map((r) => (r.publishedAt ? new Date(r.publishedAt).getTime() : null))
    .filter((t): t is number => t != null)
    .sort((a, b) => b - a)[0];
  if (lastPublished != null) {
    const daysSince = Math.floor((now - lastPublished) / (1000 * 60 * 60 * 24));
    if (daysSince > 14) {
      insights.push({
        icon: "🚨",
        tone: "bad",
        text: `Hace ${daysSince} días que no se publica nada en YouTube — el algoritmo premia la constancia.`,
        action: "Programá 1 Short esta semana aunque sea reciclando el mejor reel de IG — retomar la cadencia va antes que optimizar cualquier otra cosa.",
      });
    }
  }

  // 2. Suscriptores semana contra semana
  if (subsNow != null && subsPrev != null && subsNow !== subsPrev) {
    const diff = subsNow - subsPrev;
    insights.push(
      diff > 0
        ? { icon: "📈", tone: "good", text: `Ganaste ${diff} suscriptor${diff !== 1 ? "es" : ""} en la última semana (${fmt(subsPrev)} → ${fmt(subsNow)}).` }
        : { icon: "📉", tone: "warn" as const, text: `Perdiste ${Math.abs(diff)} suscriptor${diff !== -1 ? "es" : ""} en la última semana (${fmt(subsPrev)} → ${fmt(subsNow)}).`, action: "Mirá qué publicaste justo antes de la caída — si un video trajo subs de mala calidad o spam, no repitas ese enfoque." }
    );
  }

  // 3. Qué formato es tu motor — Shorts vs largos
  const shortViews = rows.filter((r) => r.isShort).map((r) => r.views).filter((v): v is number => v != null);
  const longViews = rows.filter((r) => !r.isShort).map((r) => r.views).filter((v): v is number => v != null);
  if (shortViews.length >= 3 && longViews.length >= 3) {
    const ms = median(shortViews);
    const ml = median(longViews);
    if (ms > 0 && ml > 0 && (ms / ml >= 1.5 || ml / ms >= 1.5)) {
      const shortsWin = ms > ml;
      insights.push({
        icon: "🎬",
        tone: "neutral",
        text: shortsWin
          ? `Tus Shorts promedian ${fmt(ms)} vistas contra ${fmt(ml)} de los videos largos — el formato corto es tu motor de alcance.`
          : `Tus videos largos promedian ${fmt(ml)} vistas contra ${fmt(ms)} de los Shorts — tu audiencia responde mejor al contenido largo.`,
        action: shortsWin
          ? "Priorizá Shorts en el plan semanal y usá los largos para profundizar los temas que ya funcionaron en corto."
          : "Dale más producción a los videos largos y usá los Shorts como tráiler para empujarlos.",
      });
    }
  }

  // 4. Mejor video reciente — qué replicar
  const recent = rows.filter((r) => r.publishedAt && now - new Date(r.publishedAt).getTime() < 30 * 24 * 60 * 60 * 1000 && r.views != null);
  if (recent.length >= 2) {
    const best = recent.reduce((a, b) => ((a.views ?? 0) >= (b.views ?? 0) ? a : b));
    const sameFormat = rows.filter((r) => r.isShort === best.isShort).map((r) => r.views).filter((v): v is number => v != null);
    const med = sameFormat.length >= 3 ? median(sameFormat) : null;
    if (best.views != null && med != null && med > 0 && best.views / med >= 1.5) {
      insights.push({
        icon: "🏆",
        tone: "good",
        text: `"${best.title.slice(0, 60)}" es tu mejor video del último mes (${fmt(best.views)} vistas, ${(best.views / med).toFixed(1)}x tu mediana).`,
        action: "Hacé una secuela o una variante del mismo tema/formato esta semana, mientras el algoritmo todavía lo asocia con tu canal.",
      });
    }
  }

  // 5. Retención de Shorts — la señal que decide si el algoritmo los empuja
  const shortRetention = rows.filter((r) => r.isShort).map((r) => r.averageViewPercentage).filter((v): v is number => v != null);
  if (shortRetention.length >= 3) {
    const mr = median(shortRetention);
    if (mr < 50) {
      insights.push({
        icon: "⚠️",
        tone: "warn",
        text: `La retención mediana de tus Shorts es ${mr.toFixed(0)}% — la mitad del video no se ve.`,
        action: "Arrancá más fuerte el primer segundo (sin intro) y acortá los que superen 45s.",
      });
    } else if (mr >= 70) {
      insights.push({
        icon: "✅",
        tone: "good",
        text: `Tus Shorts retienen muy bien (mediana ${mr.toFixed(0)}%) — el formato está funcionando.`,
        action: "Subí la frecuencia de Shorts: el techo acá no es la calidad, es la cantidad.",
      });
    }
  }

  return insights.slice(0, 5);
}
