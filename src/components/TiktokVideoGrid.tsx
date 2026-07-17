import { band, bm, BM_COLOR, type BmLevel, type MetricBand } from "@/lib/benchmark";
import { TiktokPillarSelect } from "@/components/TiktokPillarSelect";

export type TiktokGridRow = {
  id: number;
  title: string;
  publishedAt: string | null;
  tiktokUrl: string | null;
  coverImageUrl: string | null;
  pillarId: number | null;
  pillarLabel: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
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

type Bands = { views: MetricBand; likeRate: MetricBand; commentRate: MetricBand; shareRate: MetricBand };

function buildBands(rows: TiktokGridRow[]): Bands {
  const nums = (fn: (r: TiktokGridRow) => number | null) =>
    rows.map(fn).filter((v): v is number => v != null);
  return {
    views: band(nums((r) => r.views)),
    likeRate: band(nums((r) => rate(r.likes, r.views))),
    commentRate: band(nums((r) => rate(r.comments, r.views))),
    shareRate: band(nums((r) => rate(r.shares, r.views))),
  };
}

function VideoTile({ row, bands, pillars }: { row: TiktokGridRow; bands: Bands; pillars: { id: number; label: string }[] }) {
  return (
    <div className="reel-tile">
      <div className="reel-tile-media">
        {row.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.coverImageUrl} alt="" className="reel-tile-video" loading="lazy" />
        ) : (
          <div className="reel-tile-placeholder" style={{ background: "rgba(236,72,153,0.1)", color: "#ec4899" }}>
            <span style={{ fontSize: "1.6rem" }}>♪</span>
          </div>
        )}
        {row.tiktokUrl && (
          <a href={row.tiktokUrl} target="_blank" rel="noreferrer" className="reel-tile-link" title="Ver en TikTok">
            ↗
          </a>
        )}
      </div>

      <div className="reel-tile-meta">
        <span className="reel-tile-caption">{row.title || <em style={{ color: "var(--text-tertiary)" }}>Sin título</em>}</span>
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
          <MiniStat label="Shares" value={fmt(row.shares)} level={bm(rate(row.shares, row.views), bands.shareRate)} />
        </div>

        <TiktokPillarSelect videoId={row.id} pillarId={row.pillarId} pillars={pillars} />
      </div>
    </div>
  );
}

export function TiktokVideoGrid({ rows, pillars }: { rows: TiktokGridRow[]; pillars: { id: number; label: string }[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🎵</div>
        <p>No hay videos publicados todavía. Sincronizá desde Administración si la cuenta ya tiene.</p>
      </div>
    );
  }

  const bands = buildBands(rows);

  return (
    <>
      <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
        Semáforo: <span style={{ color: BM_COLOR.top }}>verde</span> = tercio superior de tu cuenta ·{" "}
        <span style={{ color: BM_COLOR.low }}>rojo</span> = tercio inferior · gris = típico. Likes, comentarios y shares se comparan como tasa sobre vistas.
      </p>
      <div className="reels-grid">
        {rows.map((row) => (
          <VideoTile key={row.id} row={row} bands={bands} pillars={pillars} />
        ))}
      </div>
    </>
  );
}
