import { band, bm, BM_COLOR, type BmLevel, type MetricBand } from "@/lib/benchmark";
import { YoutubePillarSelect } from "@/components/YoutubePillarSelect";

export type PillarOption = { id: number; label: string };

// Grilla de videos publicados con portada + semáforo de terciles — mismo
// criterio "alto/medio/bajo" que la grilla de posts de Instagram. Shorts y
// videos largos se comparan por separado (mezclar formatos rompería el
// benchmark: un Short con 5k vistas no es comparable a un video largo).
export type YoutubeGridRow = {
  id: number;
  youtubeVideoId: string;
  title: string;
  publishedAt: string | null;
  youtubeUrl: string | null;
  pillarId: number | null;
  pillarLabel: string | null;
  isShort: boolean;
  durationSec: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  averageViewDurationSec: number | null;
  averageViewPercentage: number | null;
  subscribersGained: number | null;
};

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtDur(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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

type Bands = { views: MetricBand; likeRate: MetricBand; commentRate: MetricBand; retention: MetricBand; watch: MetricBand };

function buildBands(rows: YoutubeGridRow[]): Bands {
  const nums = (fn: (r: YoutubeGridRow) => number | null) =>
    rows.map(fn).filter((v): v is number => v != null);
  return {
    views: band(nums((r) => r.views)),
    likeRate: band(nums((r) => rate(r.likes, r.views))),
    commentRate: band(nums((r) => rate(r.comments, r.views))),
    retention: band(nums((r) => r.averageViewPercentage)),
    watch: band(nums((r) => r.averageViewDurationSec)),
  };
}

const FORMAT_STYLE = {
  short: { label: "▯ Short", color: "#fb923c" },
  long: { label: "▭ Video", color: "#60a5fa" },
} as const;

function VideoTile({ row, bands, pillars }: { row: YoutubeGridRow; bands: Bands; pillars: PillarOption[] }) {
  // Las miniaturas de YouTube son URLs públicas estables (no expiran como las
  // de Meta) — no hace falta proxy.
  const thumb = `https://i.ytimg.com/vi/${row.youtubeVideoId}/hqdefault.jpg`;
  const fstyle = FORMAT_STYLE[row.isShort ? "short" : "long"];

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
        <span className="reel-tile-badge" style={{ color: fstyle.color, borderColor: `${fstyle.color}55`, background: "rgba(10,10,10,0.72)" }}>
          {fstyle.label}{row.durationSec != null ? ` · ${fmtDur(row.durationSec)}` : ""}
        </span>
      </div>

      <div className="reel-tile-meta">
        <span className="reel-tile-caption">{row.title}</span>
        <div className="reel-tile-stats">
          <span>{row.publishedAt ? new Date(row.publishedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
          {row.pillarLabel && (
            <>
              <span>·</span>
              <span style={{ color: "var(--accent)" }}>{row.pillarLabel}</span>
            </>
          )}
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
          {!row.isShort && (
            <MiniStat label="Watch" value={fmtDur(row.averageViewDurationSec)} level={bm(row.averageViewDurationSec, bands.watch)} />
          )}
          {row.subscribersGained != null && row.subscribersGained > 0 && (
            <MiniStat label="Subs +" value={`+${row.subscribersGained}`} />
          )}
        </div>

        <YoutubePillarSelect videoId={row.id} pillarId={row.pillarId} pillars={pillars} />
      </div>
    </div>
  );
}

function Section({ title, note, rows, pillars }: { title: string; note?: string; rows: YoutubeGridRow[]; pillars: PillarOption[] }) {
  if (rows.length === 0) return null;
  const bands = buildBands(rows);
  return (
    <div style={{ marginBottom: "1.75rem" }}>
      <h3 style={{ fontSize: "0.85rem", fontWeight: 600, margin: "0 0 0.2rem" }}>{title} ({rows.length})</h3>
      {note && <p style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", margin: "0 0 0.9rem" }}>{note}</p>}
      <div className="reels-grid">
        {rows.map((row) => (
          <VideoTile key={row.id} row={row} bands={bands} pillars={pillars} />
        ))}
      </div>
    </div>
  );
}

export function YoutubeVideoGrid({ rows, pillars }: { rows: YoutubeGridRow[]; pillars: PillarOption[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🎬</div>
        <p>No hay videos publicados todavía. Importalos desde Administración si el canal ya tiene.</p>
      </div>
    );
  }

  const shorts = rows.filter((r) => r.isShort);
  const longs = rows.filter((r) => !r.isShort);

  return (
    <>
      <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1.25rem" }}>
        Semáforo: <span style={{ color: BM_COLOR.top }}>verde</span> = tercio superior de tu canal ·{" "}
        <span style={{ color: BM_COLOR.low }}>rojo</span> = tercio inferior · gris = típico. Shorts y videos largos se
        comparan por separado; likes y comentarios como tasa sobre vistas. Retención y watch time pueden tardar 24-48h
        en aparecer para videos recientes (retraso de YouTube, no nuestro).
      </p>
      <Section title="▯ Shorts (verticales)" rows={shorts} pillars={pillars} />
      <Section title="▭ Videos largos (horizontales)" rows={longs} pillars={pillars} />
    </>
  );
}
