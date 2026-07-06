"use client";

import { useState } from "react";
import type { CampaignSummary, AdSummary, AdBenchmark } from "@/lib/ads-insights";
import { CampaignTable } from "./AdsPanels";
import { AdCreativeGrid } from "./AdCreativeGrid";

export function AdsView({
  campaigns, ads, bench,
}: {
  campaigns: CampaignSummary[];
  ads: AdSummary[];
  bench: AdBenchmark;
}) {
  const [view, setView] = useState<"ads" | "campaigns">("ads");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.25rem" }}>
        <div className="view-toggle">
          <button className={`view-toggle-btn${view === "ads" ? " active" : ""}`} onClick={() => setView("ads")}>
            🎨 Anuncios
          </button>
          <button className={`view-toggle-btn${view === "campaigns" ? " active" : ""}`} onClick={() => setView("campaigns")}>
            ☰ Campañas
          </button>
        </div>
      </div>

      {view === "ads" ? <AdCreativeGrid ads={ads} bench={bench} /> : <CampaignTable campaigns={campaigns} />}
    </div>
  );
}
