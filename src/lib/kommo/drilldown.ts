import type { KommoPipeline } from "@/lib/kommo/api";
import {
  adRefOf,
  capitalFloor,
  capitalOf,
  firstStageByPipeline,
  hasAdTracking,
  interestOf,
  isCalled,
  isQualityLead,
  isQualified,
  qualifiedStageKeys,
  LOST_STATUS_ID,
  WON_STATUS_ID,
  type KommoLeadRow,
} from "@/lib/kommo/insights";

// Filtros del listado que se abre al hacer click en una estadística de
// /kommo. Formato: condiciones "clave:valor" unidas por "|" (todas deben
// cumplirse), ej: "channel:whatsapp|qualified". Cada estadística de la página
// declara el filtro que corresponde a los leads que cuenta — así el listado
// siempre coincide con el número que se clickeó.
export function buildMatcher(filter: string, pipelines: KommoPipeline[]) {
  const qualifiedKeys = qualifiedStageKeys(pipelines);
  const firstStages = firstStageByPipeline(pipelines);
  const conds = filter.split("|").filter(Boolean).map((c) => {
    const i = c.indexOf(":");
    return i === -1 ? { key: c, value: "" } : { key: c.slice(0, i), value: c.slice(i + 1) };
  });

  return (l: KommoLeadRow): boolean =>
    conds.every(({ key, value }) => {
      switch (key) {
        case "all": return true;
        case "won": return l.statusId === WON_STATUS_ID;
        case "lost": return l.statusId === LOST_STATUS_ID;
        case "qualified": return isQualified(l, qualifiedKeys);
        case "called": return isCalled(l);
        case "inprog": return !(l.pipelineId != null && firstStages.get(l.pipelineId) === l.statusId);
        case "channel": return (l.channel ?? "none") === value;
        case "interest": return interestOf(l) === value;
        case "capital": return capitalOf(l) === value;
        case "pipeline": return l.pipelineId === value;
        case "status": return l.statusId === value;
        case "loss": return (l.lossReasonId ?? "none") === value;
        case "user": return l.responsibleUserId === value;
        // Anuncios (Meta): el valor va con encodeURIComponent porque los nombres traen "|" y ":".
        case "campaign":
        case "adset":
        case "ad": return adRefOf(l, key)?.key === decodeURIComponent(value);
        case "untracked": return !hasAdTracking(l);
        case "answered": return interestOf(l) != null;
        case "acumular": return interestOf(l) === "Acumular BTC";
        case "cap4k": return (capitalFloor(l) ?? 0) >= 4000;
        case "cap10k": return (capitalFloor(l) ?? 0) >= 10000;
        case "quality": return isQualityLead(l);
        default: return false; // filtro desconocido: mejor lista vacía que una lista equivocada
      }
    });
}
