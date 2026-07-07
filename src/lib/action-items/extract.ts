// Los informes de IA (organic y ads) siempre terminan con una sección fija
// "🎯 ACCIONES PARA LA SEMANA" de 3 puntos (ver ORGANIC_SYSTEM_PROMPT /
// ADS_SYSTEM_PROMPT). Esto la parsea a una lista de strings para guardarlas
// como action items individuales en vez de dejarlas enterradas en el texto.
const ITEM_START = /^(\d+[.)]|-|•)\s*/;

export function extractActionTexts(summary: string): string[] {
  const marker = summary.indexOf("🎯");
  if (marker === -1) return [];

  const lines = summary
    .slice(marker)
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const hasMarkers = lines.some((l) => ITEM_START.test(l));
  if (!hasMarkers) return lines.slice(0, 3);

  const items: string[] = [];
  for (const line of lines) {
    if (ITEM_START.test(line)) {
      items.push(line.replace(ITEM_START, "").trim());
    } else if (items.length > 0) {
      items[items.length - 1] += ` ${line}`;
    }
  }
  return items.slice(0, 3);
}
