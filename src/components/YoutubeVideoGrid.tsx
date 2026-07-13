import { band, bm, BM_COLOR, type BmLevel, type MetricBand } from "@/lib/benchmark";

// Grilla de videos publicados con portada + semáforo de terciles — mismo
// criterio "alto/medio/bajo" que la grilla de posts de Instagram, comparando
// cada video contra los demás videos del propio canal.
export type YoutubeGridRow = {
  id: number;
  youtubeVideoId: string;
  title: string;
  publishedAt: string | null;
  youtubeUrl: string | null;
  pillarLabel: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  averageViewPercentage: number | null;
  subscribersGained: number | null;
};

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function rate(num: number | null, denom: number | null): number | null {
  if (num == null || denom == null || denom <= 0) return null;
  return num / denom;
}

function MiniStat({ label, value, level }: { label: string; value: string; level?: BmLevel }) {
  return (
    <div className="reel-tile-mini-stat">
      <span className="reel-tile-mini-value" style={{ color: level ? BM_COLOR[level] : "var(--text)" }}>{value}</span>
      <span className="reel-tile-mini-label">{label}</span>
    </div>
  );
}

type Bands = { views: MetricBand; likeRate: MetricBand; commentRate: MetricBand; retention: MetricBand };

function buildBands(rows: YoutubeGridRow[]): Bands {
  const nums = (fn: (r: YoutubeGridRow) => number | null) =>
    rows.map(fn).filter((v): v is number => v != null);
  return {
    views: band(nums((r) => r.views)),
    likeRate: band(nums((r) => rate(r.likes, r.views))),
    commentRate: band(nums((r) => rate(r.comments, r.views))),
    retention: band(nums((r) => r.averageViewPercentage)),
  };
}

function VideoTile({ row, bands }: { row: YoutubeGridRow; bands: Bands }) {
  // Las miniaturas de YouTube son URLs públicas estables (no expiran como las
  // de Meta) — no hace falta proxy.
  const thumb = `https://i.ytimg.com/vi/${row.youtubeVideoId}/hqdefault.jpg`;

  return (
    <div className="reel-tile">
      <div className="reel-tile-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt="" className="reel-tile-video" loading="lazy" />
        {row.youtubeUrl && (
          <a href={row.youtubeUrl} target="_blank" rel="noreferrer" className="reel-tile-link" title="Ver en YouTube">
            ↗
          </a>
        )}
        {row.pillarLabel && (
          <span className="reel-tile-badge" style={{ color: "var(--accent)", borderColor: "rgba(191,138,30,0.4)", background: "rgba(10,10,10,0.72)" }}>
            {row.pillarLabel}
          </span>
        )}
      </div>

      <div className="reel-tile-meta">
        <span className="reel-tile-caption">{row.title}</span>
        <div className="reel-tile-stats">
          <span>{row.publishedAt ? new Date(row.publishedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
          <span>·</span>
          <span>👁 {fmt(row.views)}</span>
        </div>

        <div className="reel-tile-mini-grid">
          <MiniStat label="Vistas" value={fmt(row.views)} level={bm(row.views, bands.views)} />
          <MiniStat label="Likes" value={fmt(row.likes)} level={bm(rate(row.likes, row.views), bands.likeRate)} />
          <MiniStat label="Coment." value={fmt(row.comments)} level={bm(rate(row.comments, row.views), bands.commentRate)} />
          <MiniStat
            label="Retención"
            value={row.averageViewPercentage != null ? `${row.averageViewPercentage.toFixed(0)}%` : "—"}
            level={bm(row.averageViewPercentage, bands.retention)}
          />
          {row.subscribersGained != null && row.subscribersGained > 0 && (
            <MiniStat label="Subs +" value={`+${row.subscribersGained}`} />
          )}
        </div>
      </div>
    </div>
  );
}

export function YoutubeVideoGrid({ rows }: { rows: YoutubeGridRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🎬</div>
        <p>No hay videos publicados todavía. Importalos desde Administración si el canal ya tiene.</p>
      </div>
    );
  }

  const bands = buildBands(rows);

  return (
    <>
      <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
        Colores: <span style={{ color: BM_COLOR.top }}>verde</span> = tercio superior de tu propio canal ·{" "}
        <span style={{ color: BM_COLOR.low }}>rojo</span> = tercio inferior · gris = típico. Likes y comentarios se comparan como tasa sobre vistas.
      </p>
      <div className="reels-grid">
        {rows.map((row) => (
          <VideoTile key={row.id} row={row} bands={bands} />
        ))}
      </div>
    </>
  );
}
