// Conclusiones automáticas a partir de los agregados ya calculados — sin IA,
// sin costo, instantáneas. El objetivo es que lo primero que se vea en
// Analítica ya sea accionable, sin tener que apretar "Analizar" ni leer
// todos los paneles para entender qué hacer esta semana.
import type { PillarStat, HashtagStat, HeatCell, HookPost, WeekPoint } from "./insights";
import { DAY_LABELS, SLOT_LABELS } from "./insights";

// `action` — la regla de oro: ninguna señal sin su orden. El texto observa
// ("tu alcance bajó 20%"), la acción prescribe ("subí la frecuencia de X").
export type KeyInsight = { icon: string; text: string; tone: "good" | "warn" | "bad" | "neutral"; action?: string };

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function buildKeyInsights(args: {
  pillarStats: PillarStat[];
  hashtagStats: HashtagStat[];
  heatmapBest: HeatCell | null;
  hookMedianSkip: number | null;
  hookWorst: HookPost[];
  weekPoints: WeekPoint[];
}): KeyInsight[] {
  const { pillarStats, hashtagStats, heatmapBest, hookMedianSkip, hookWorst, weekPoints } = args;
  const insights: KeyInsight[] = [];

  // 1. Salud de ganchos — si es crítico, es la alerta más urgente
  if (hookMedianSkip != null) {
    if (hookMedianSkip > 50) {
      const worst = hookWorst[0];
      insights.push({
        icon: "🚨",
        tone: "bad",
        text: `Skip rate crítico (${hookMedianSkip.toFixed(0)}%): la mayoría abandona tus reels sin verlos${worst?.caption ? ` — el peor caso es "${worst.caption.slice(0, 50)}"` : ""}.`,
        action: "Cambiá el primer segundo de tus reels: arrancá con la promesa o el dato más fuerte, sin intro. Compará tus 3 reels con menos skip y copiá ese arranque.",
      });
    } else if (hookMedianSkip > 30) {
      insights.push({
        icon: "⚠️",
        tone: "warn",
        text: `Skip rate mejorable (${hookMedianSkip.toFixed(0)}%) — todavía hay margen para enganchar más rápido en el arranque de tus reels.`,
        action: "Probá arrancar los próximos 3 reels con la conclusión en pantalla (texto grande) en el segundo 0.",
      });
    } else {
      insights.push({
        icon: "✅",
        tone: "good",
        text: `Tus ganchos retienen bien (skip rate ${hookMedianSkip.toFixed(0)}%, por debajo del umbral sano de 30%).`,
      });
    }
  }

  // 2. Tendencia de alcance semana contra semana (últimas dos con datos)
  const weeksWithData = weekPoints.filter((w) => w.medianReach != null);
  if (weeksWithData.length >= 2) {
    const last = weeksWithData[weeksWithData.length - 1];
    const prev = weeksWithData[weeksWithData.length - 2];
    if (last.medianReach != null && prev.medianReach != null && prev.medianReach > 0) {
      const change = ((last.medianReach - prev.medianReach) / prev.medianReach) * 100;
      if (Math.abs(change) >= 15) {
        insights.push({
          icon: change > 0 ? "📈" : "📉",
          tone: change > 0 ? "good" : "warn",
          text: `Tu alcance mediano ${change > 0 ? "subió" : "bajó"} ${Math.abs(change).toFixed(0)}% vs. la semana anterior (${fmt(prev.medianReach)} → ${fmt(last.medianReach)}).`,
          action: change > 0
            ? "Identificá qué publicaste esta semana que no venías haciendo y repetilo la próxima."
            : "Revisá qué cambió: ¿publicaste menos, cambiaste de formato o de horario? Volvé a lo que funcionaba la semana anterior.",
        });
      }
    }
  }

  // 3. Pilar más fuerte (si hay al menos 2 para comparar)
  if (pillarStats.length >= 2) {
    const top = pillarStats[0];
    if (top.erMediana != null) {
      insights.push({
        icon: "🏆",
        tone: "good",
        text: `"${top.label}" es tu pilar más fuerte (ER mediana ${(top.erMediana * 100).toFixed(1)}%, ${top.posts} posts).`,
        action: `Sumá 1-2 posts más de "${top.label}" al plan de la próxima semana, reemplazando al pilar que peor rinde.`,
      });
    }
  } else if (pillarStats.length === 1) {
    const only = pillarStats[0];
    if (only.erMediana != null) {
      insights.push({
        icon: "📌",
        tone: "neutral",
        text: `Solo "${only.label}" tiene suficientes posts para el ranking de pilares (ER mediana ${(only.erMediana * 100).toFixed(1)}%) — probá otros pilares para poder comparar.`,
      });
    }
  }

  // 4. Mejor horario
  if (heatmapBest) {
    insights.push({
      icon: "⏰",
      tone: "neutral",
      text: `Publicando ${DAY_LABELS[heatmapBest.day]} en la franja ${SLOT_LABELS[heatmapBest.slot]} conseguís el mejor alcance mediano (${fmt(heatmapBest.median)}, ${heatmapBest.count} posts).`,
      action: "Programá los posts importantes en esa franja — el calendario ya te la sugiere con el botón \"Usar\".",
    });
  }

  // 5. Hashtag que más repite entre los de mejor alcance
  if (hashtagStats.length > 0) {
    const top = hashtagStats[0];
    insights.push({
      icon: "#️⃣",
      tone: "neutral",
      text: `${top.tag} está en tus posts de mejor alcance (mediana ${fmt(top.alcanceMediano)} en ${top.posts} posts).`,
      action: `Incluí ${top.tag} en todos los posts del pilar donde mejor funciona.`,
    });
  }

  return insights.slice(0, 5);
}
