export type CalendarPost = {
  id: number;
  pillarId: number;
  caption: string;
  mediaType: string;
  mediaUrl: string;
  scheduledAt: string;
  status: string;
  igPermalink: string | null;
  productionStatus: string | null;
  channel: string | null;
  format: string | null;
  editorId: number | null;
  rawFootageUrl: string | null;
};

export type Pillar = { id: number; key: string; label: string };
export type Editor = { id: number; key: string; label: string };

export const PILLAR_COLORS = [
  "#F7931A", "#60A5FA", "#22C55E", "#A78BFA",
  "#F472B6", "#FB923C", "#2DD4BF", "#EAB308",
];

export function pillarColor(pillarId: number, pillars: Pillar[]): string {
  const idx = pillars.findIndex((p) => p.id === pillarId);
  return PILLAR_COLORS[idx % PILLAR_COLORS.length] ?? "#888";
}

export const MEDIA_TYPE_ICON: Record<string, string> = {
  IMAGE: "◻", VIDEO: "▶", REELS: "▶", CAROUSEL_ALBUM: "⊞",
};

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SCHEDULED: "Programado",
  PUBLISHING: "Publicando…",
  PUBLISHED: "Publicado",
  FAILED: "Falló",
};

export const STATUS_COLOR: Record<string, string> = {
  DRAFT: "#888",
  SCHEDULED: "#60A5FA",
  PUBLISHING: "#EAB308",
  PUBLISHED: "#22C55E",
  FAILED: "#EF4444",
};

export const PRODUCTION_STATUS_LABEL: Record<string, string> = {
  SIN_INICIAR: "Sin iniciar",
  SIN_GRABAR: "Sin grabar",
  PROCESO: "En proceso",
  EDITADO: "Editado",
  A_REVISAR: "A revisar",
  SUBIDO: "Subido",
};

export const CHANNEL_LABEL: Record<string, string> = {
  SOLO_TIKTOK: "Solo TikTok",
  VERTICAL: "Vertical",
  YOUTUBE: "YouTube",
  PAUTA: "Pauta",
  TODOS: "Todos",
};

export const FORMAT_LABEL: Record<string, string> = {
  VERTICAL: "Vertical",
  HORIZONTAL: "Horizontal",
};
