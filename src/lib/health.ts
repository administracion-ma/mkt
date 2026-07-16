// Semáforo de salud por área — la respuesta de 3 segundos a "¿cómo va el
// área de marketing?". Reglas simples sobre datos ya calculados, sin IA.
// good=verde, warn=amarillo, bad=rojo, off=sin conectar/configurar (gris).

export type AreaHealth = {
  area: string;
  href: string;
  level: "good" | "warn" | "bad" | "off";
  text: string;
};

export function buildHealth(args: {
  ig: { postsLast7: number; postsPrev7: number; avgReach: number | null; prevAvgReach: number | null };
  ads: { connected: boolean; spend: number; results: number; costPerResult: number | null; prevCostPerResult: number | null };
  youtube: { connected: boolean; daysSinceLastVideo: number | null; subsNow: number | null; subsPrev: number | null };
  sales: { monthRevenue: number; monthTarget: number | null; monthProgress: number };
}): AreaHealth[] {
  const out: AreaHealth[] = [];

  // ── IG orgánico ──
  {
    const { postsLast7, postsPrev7, avgReach, prevAvgReach } = args.ig;
    const reachChange =
      avgReach != null && prevAvgReach != null && prevAvgReach > 0
        ? ((avgReach - prevAvgReach) / prevAvgReach) * 100
        : null;
    if (postsLast7 === 0 && postsPrev7 === 0) {
      out.push({ area: "IG orgánico", href: "/analytics", level: "bad", text: "2 semanas sin publicar — el alcance se apaga solo." });
    } else if (postsLast7 === 0) {
      out.push({ area: "IG orgánico", href: "/analytics", level: "warn", text: "Esta semana no se publicó nada todavía." });
    } else if (reachChange != null && reachChange < -15) {
      out.push({ area: "IG orgánico", href: "/analytics", level: "warn", text: `El alcance cayó ${Math.abs(reachChange).toFixed(0)}% vs la semana pasada.` });
    } else {
      out.push({ area: "IG orgánico", href: "/analytics", level: "good", text: `${postsLast7} post${postsLast7 !== 1 ? "s" : ""} esta semana${reachChange != null && reachChange > 15 ? `, alcance +${reachChange.toFixed(0)}%` : ", ritmo sano"}.` });
    }
  }

  // ── Pauta ──
  {
    const { connected, spend, results, costPerResult, prevCostPerResult } = args.ads;
    if (!connected) {
      out.push({ area: "Pauta", href: "/admin", level: "off", text: "Sin cuenta conectada." });
    } else {
      const costChange =
        costPerResult != null && prevCostPerResult != null && prevCostPerResult > 0
          ? ((costPerResult - prevCostPerResult) / prevCostPerResult) * 100
          : null;
      if (costChange != null && costChange > 25) {
        out.push({ area: "Pauta", href: "/ads", level: "bad", text: `El costo por resultado saltó ${costChange.toFixed(0)}% — mirá los puntos clave de Meta Ads.` });
      } else if (spend > 0 && results === 0) {
        out.push({ area: "Pauta", href: "/ads", level: "warn", text: "Hay gasto esta semana pero cero resultados registrados." });
      } else if (costChange != null && costChange > 10) {
        out.push({ area: "Pauta", href: "/ads", level: "warn", text: `El costo por resultado subió ${costChange.toFixed(0)}% vs la semana pasada.` });
      } else if (spend === 0) {
        out.push({ area: "Pauta", href: "/ads", level: "warn", text: "Sin inversión esta semana." });
      } else {
        out.push({ area: "Pauta", href: "/ads", level: "good", text: "Costo por resultado estable." });
      }
    }
  }

  // ── YouTube ──
  {
    const { connected, daysSinceLastVideo, subsNow, subsPrev } = args.youtube;
    if (!connected) {
      out.push({ area: "YouTube", href: "/admin", level: "off", text: "Sin canal conectado." });
    } else if (daysSinceLastVideo != null && daysSinceLastVideo > 21) {
      out.push({ area: "YouTube", href: "/youtube", level: "bad", text: `${daysSinceLastVideo} días sin publicar — el canal está frenado.` });
    } else if (subsNow != null && subsPrev != null && subsNow < subsPrev) {
      out.push({ area: "YouTube", href: "/youtube", level: "warn", text: `Perdiste ${subsPrev - subsNow} suscriptores esta semana.` });
    } else if (daysSinceLastVideo != null && daysSinceLastVideo > 10) {
      out.push({ area: "YouTube", href: "/youtube", level: "warn", text: `${daysSinceLastVideo} días sin publicar.` });
    } else {
      out.push({ area: "YouTube", href: "/youtube", level: "good", text: "Cadencia y suscriptores en orden." });
    }
  }

  // ── Ventas ──
  {
    const { monthRevenue, monthTarget, monthProgress } = args.sales;
    if (monthTarget == null) {
      out.push({ area: "Ventas", href: "/settings", level: "off", text: "Definí una meta mensual en Ficha de marca para medir esto." });
    } else {
      // pace = lo que llevás vendido vs lo que "deberías" llevar a esta altura del mes
      const expected = monthTarget * monthProgress;
      const pace = expected > 0 ? monthRevenue / expected : 0;
      const pct = monthTarget > 0 ? (monthRevenue / monthTarget) * 100 : 0;
      if (pace >= 0.9) {
        out.push({ area: "Ventas", href: "/ads", level: "good", text: `${pct.toFixed(0)}% de la meta del mes — venís a ritmo.` });
      } else if (pace >= 0.5) {
        out.push({ area: "Ventas", href: "/ads", level: "warn", text: `${pct.toFixed(0)}% de la meta del mes — venís un poco atrás del ritmo esperado.` });
      } else {
        out.push({ area: "Ventas", href: "/ads", level: "bad", text: `${pct.toFixed(0)}% de la meta del mes — muy por debajo del ritmo (¿faltan cargar ventas?).` });
      }
    }
  }

  return out;
}
