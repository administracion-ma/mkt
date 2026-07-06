// Tasa de cambio a dólares — para poder mostrar el gasto de pauta en USD sin
// importar en qué moneda esté la cuenta publicitaria conectada (ej. PYG).
// Cache de unas horas: el tipo de cambio no necesita ser al segundo acá.
const FX_BASE = "https://open.er-api.com/v6/latest/USD";

// Devuelve cuántas unidades de `currencyCode` equivalen a 1 USD, o null si no
// se pudo obtener (moneda no reconocida, servicio caído, etc).
export async function getUsdRate(currencyCode: string): Promise<number | null> {
  if (currencyCode === "USD") return 1;
  try {
    const res = await fetch(FX_BASE, { next: { revalidate: 6 * 60 * 60 } });
    if (!res.ok) return null;
    const body = await res.json();
    const rate = body?.rates?.[currencyCode];
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

export function toUsd(amount: number, ratePerUsd: number): number {
  return amount / ratePerUsd;
}
