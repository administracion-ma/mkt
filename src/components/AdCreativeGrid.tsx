"use client";

import { useEffect, useRef, useState } from "react";
import type { AdSummary, AdBenchmark, AdCreativeRow } from "@/lib/ads-insights";
import { bm, BM_COLOR, adMonthlyTrend } from "@/lib/ads-insights";
import { fmtMoney, fmt, MiniMonthBars } from "./AdsPanels";

const STATUS_COLOR: Record<string, string> = { ACTIVE: "#22c55e", PAUSED: "#eab308", ARCHIVED: "#6b7280", DELETED: "#ef4444" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Activo", PAUSED: "Pausado", ARCHIVED: "Archivado", DELETED: "Eliminado" };

// Mismo lazy-mount que ReelsGrid: no pedir todas las miniaturas de una si hay
// muchos anuncios en pantalla.
function useInView<T extends HTMLElement>(rootMargin = "400px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setInView(true); },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

function MiniStat({ label, value, level }: { label: string; value: string; level?: "top" | "typical" | "low" }) {
  return (
    <div className="reel-tile-mini-stat">
      <span className="reel-tile-mini-value" style={{ color: level ? BM_COLOR[level] : "var(--text)" }}>{value}</span>
      <span className="reel-tile-mini-label">{label}</span>
    </div>
  );
}

function AdThumb({ ad }: { ad: AdSummary }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [failed, setFailed] = useState(false);
  const src = ad.thumbnailUrl ? `/api/ad-media/${ad.adId}` : null;
  const statusColor = ad.status ? STATUS_COLOR[ad.status] ?? "#6b7280" : "#6b7280";
  const highFatigue = ad.frequency != null && ad.frequency >= 4;

  return (
    <div ref={ref} className="reel-tile-media">
      {inView && src && !failed ? (
        <img src={src} alt="" className="reel-tile-video" onError={() => setFailed(true)} />
      ) : (
        <div className="reel-tile-placeholder" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-tertiary)" }}>
          <span style={{ fontSize: "1.6rem" }}>{ad.isVideo ? "▶" : "◻"}</span>
        </div>
      )}

      {ad.status && (
        <span className="reel-tile-badge" style={{ color: statusColor, borderColor: `${statusColor}55`, background: "rgba(10,10,10,0.72)" }}>
          {STATUS_LABEL[ad.status] ?? ad.status}
        </span>
      )}

      {highFatigue && (
        <span
          className="reel-tile-score"
          style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.4)" }}
          title="Frecuencia alta: mucha gente ya vio este anuncio varias veces — señal de fatiga de creativo"
        >
          ⚠ Fatiga
        </span>
      )}
    </div>
  );
}

function AdMiniGrid({ ad, bench }: { ad: AdSummary; bench: AdBenchmark }) {
  const freqLevel = bm(ad.frequency, bench.frequency, true);
  return (
    <div className="reel-tile-mini-grid">
      <MiniStat label="Gasto" value={fmtMoney(ad.spend)} />
      <MiniStat label="CTR" value={ad.ctr != null ? `${ad.ctr.toFixed(2)}%` : "—"} level={bm(ad.ctr, bench.ctr)} />
      <MiniStat label="CPC" value={fmtMoney(ad.cpc)} level={bm(ad.cpc, bench.cpc, true)} />
      <MiniStat label="Frec." value={ad.frequency != null ? ad.frequency.toFixed(1) : "—"} level={freqLevel} />
      <MiniStat label="Result." value={fmt(ad.results)} />
      <MiniStat label="Mensajes" value={fmt(ad.messages)} />
      <MiniStat label="Costo/result." value={fmtMoney(ad.costPerResult)} level={bm(ad.costPerResult, bench.costPerResult, true)} />
    </div>
  );
}

function AdTile({ ad, bench, onExpand }: { ad: AdSummary; bench: AdBenchmark; onExpand: () => void }) {
  return (
    <div className="reel-tile">
      <AdThumb ad={ad} />
      <div className="reel-tile-meta">
        <span className="reel-tile-caption" title={ad.name}>{ad.name}</span>
        <div className="reel-tile-stats">
          <span title={ad.campaignName}>{ad.campaignName.length > 22 ? `${ad.campaignName.slice(0, 22)}…` : ad.campaignName}</span>
        </div>
        <AdMiniGrid ad={ad} bench={bench} />
        <button className="reel-tile-expand" onClick={onExpand}>
          Ver historial mensual ↗
        </button>
      </div>
    </div>
  );
}

function AdDetailModal({
  ad, bench, monthlyRows, onClose,
}: {
  ad: AdSummary;
  bench: AdBenchmark;
  monthlyRows: AdCreativeRow[];
  onClose: () => void;
}) {
  const months = adMonthlyTrend(monthlyRows, ad.adId);
  const hasMessages = months.some((m) => m.messages > 0);

  return (
    <div className="reel-modal-overlay" onClick={onClose}>
      <div className="reel-modal" onClick={(e) => e.stopPropagation()}>
        <button className="reel-modal-close" onClick={onClose}>✕</button>
        <div style={{ display: "flex", gap: "1.1rem", flexWrap: "wrap" }}>
          <div style={{ width: 160 }}>
            <AdThumb ad={ad} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ margin: "0 0 0.3rem", fontSize: "0.9rem", fontWeight: 700 }}>{ad.name}</p>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{ad.campaignName}</p>
            <AdMiniGrid ad={ad} bench={bench} />
          </div>
        </div>

        {months.length >= 2 ? (
          <>
            <MiniMonthBars points={months} label="Gasto" color="#CC7508" formatValue={(p) => p.spend} />
            {hasMessages && (
              <MiniMonthBars points={months} label="Mensajes" color="#3b82f6" formatValue={(p) => p.messages} />
            )}
          </>
        ) : (
          <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "1rem" }}>
            Todavía no hay suficiente historial (se necesitan al menos 2 meses distintos con datos) para ver la tendencia mensual de este anuncio.
          </p>
        )}
      </div>
    </div>
  );
}

export function AdCreativeGrid({ ads, bench, monthlyRows }: { ads: AdSummary[]; bench: AdBenchmark; monthlyRows: AdCreativeRow[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const expandedAd = expandedId != null ? ads.find((a) => a.adId === expandedId) ?? null : null;

  if (ads.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🎨</div>
        <p>No hay anuncios con datos en este período.</p>
      </div>
    );
  }

  return (
    <>
      <div className="reels-grid">
        {ads.map((ad) => (
          <AdTile key={ad.adId} ad={ad} bench={bench} onExpand={() => setExpandedId(ad.adId)} />
        ))}
      </div>

      {expandedAd && (
        <AdDetailModal ad={expandedAd} bench={bench} monthlyRows={monthlyRows} onClose={() => setExpandedId(null)} />
      )}
    </>
  );
}
