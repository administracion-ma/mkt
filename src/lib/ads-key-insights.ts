// Conclusiones automáticas para /ads — mismo espíritu que key-insights.ts
// (Instagram): sin IA, sin costo, instantáneas. El diagnóstico de fatiga y
// costo-empeorando ya existía pero enterrado en el modal de cada anuncio;
// acá sube a la cabecera de la página para que no haya que ir a buscarlo.
import type { KeyInsight } from "@/lib/key-insights";
import { adMonthlyTrend, type AdCreativeRow, type AdSummary, type CampaignSummary, type UnifiedPillarRow } from "@/lib/ads-insights";

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: n < 10 ? 2 : 0 })}`;
}

export function buildAdsKeyInsights(args: {
  adStats: AdSummary[];
  campaignStats: CampaignSummary[];
  unifiedRows: UnifiedPillarRow[];
  adRowsLong: AdCreativeRow[]; // ventana larga (400d) para la tendencia mensual
  spend: number;
  prevSpend: number | null;
  costPerResult: number | null;
  prevCostPerResult: number | null;
  roas: number | null;
}): KeyInsight[] {
  const { adStats, campaignStats, unifiedRows, adRowsLong, costPerResult, prevCostPerResult, roas } = args;
  const insights: KeyInsight[] = [];

  // 1. Anuncios para pausar/renovar — la alerta más accionable de toda la página
  const diagnosed = adStats.map((ad) => {
    const months = adMonthlyTrend(adRowsLong, ad.adId);
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    const worsening = last?.costPerResult != null && prev?.costPerResult != null && last.costPerResult > prev.costPerResult * 1.1;
    const fatigued = ad.frequency != null && ad.frequency >= 4;
    return { ad, fatigued, worsening };
  });

  for (const d of diagnosed.filter((d) => d.fatigued && d.worsening).slice(0, 2)) {
    insights.push({
      icon: "🔴",
      tone: "bad",
      text: `"${d.ad.name}" tiene fatiga (frecuencia ${d.ad.frequency?.toFixed(1)}) y su costo/resultado viene empeorando — pausalo o renová el creativo.`,
    });
  }
  if (!diagnosed.some((d) => d.fatigued && d.worsening)) {
    const onlyFatigued = diagnosed.find((d) => d.fatigued);
    if (onlyFatigued) {
      insights.push({
        icon: "⚠️",
        tone: "warn",
        text: `"${onlyFatigued.ad.name}" está mostrándose demasiado a las mismas personas (frecuencia ${onlyFatigued.ad.frequency?.toFixed(1)}) — vigilalo, es la antesala de la fatiga.`,
      });
    }
  }

  // 2. Tendencia de eficiencia — cuánto pagás por resultado vs período anterior
  if (costPerResult != null && prevCostPerResult != null && prevCostPerResult > 0) {
    const change = ((costPerResult - prevCostPerResult) / prevCostPerResult) * 100;
    if (change >= 10) {
      insights.push({
        icon: "📉",
        tone: "warn",
        text: `Cada resultado te está costando ${change.toFixed(0)}% más que el período anterior (${money(prevCostPerResult)} → ${money(costPerResult)}).`,
      });
    } else if (change <= -10) {
      insights.push({
        icon: "📈",
        tone: "good",
        text: `La pauta se volvió más eficiente: cada resultado cuesta ${Math.abs(change).toFixed(0)}% menos que el período anterior (${money(prevCostPerResult)} → ${money(costPerResult)}).`,
      });
    }
  }

  // 3. ROAS — la métrica reina cuando hay ventas cargadas
  if (roas != null) {
    insights.push(
      roas >= 1
        ? { icon: "✅", tone: "good", text: `Cada dólar invertido en pauta devolvió $${roas.toFixed(2)} en ventas cargadas (ROAS ${roas.toFixed(1)}x).` }
        : { icon: "🚨", tone: "bad", text: `La pauta todavía no se paga sola: cada dólar invertido devolvió $${roas.toFixed(2)} en ventas cargadas (ROAS ${roas.toFixed(1)}x).` }
    );
  }

  // 4. Campaña más eficiente — a dónde mover presupuesto
  const withResults = campaignStats.filter((c) => c.results >= 3 && c.costPerResult != null);
  if (withResults.length >= 2) {
    const best = withResults.reduce((a, b) => (a.costPerResult! <= b.costPerResult! ? a : b));
    insights.push({
      icon: "🏆",
      tone: "good",
      text: `"${best.name}" es tu campaña más eficiente (${money(best.costPerResult)} por resultado) — candidata a recibir más presupuesto.`,
    });
  }

  // 5. Pilar con plata pero sin orgánico — pauta empujando contenido que no existe
  const paidNoOrganic = unifiedRows.find((r) => r.paidSpend > 0 && r.organicPosts === 0);
  if (paidNoOrganic) {
    insights.push({
      icon: "⚠️",
      tone: "warn",
      text: `Estás poniendo pauta en "${paidNoOrganic.label}" (${money(paidNoOrganic.paidSpend)}) pero no publicaste nada orgánico de ese pilar en el período — la pauta rinde más cuando acompaña contenido vivo.`,
    });
  }

  return insights.slice(0, 5);
}
