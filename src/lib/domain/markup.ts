// Наценка как в LiveSklad: от цены, %, плюс рубли, округление вверх до шага.

export type PriceField = "cost" | "price" | "repairPrice" | "minPrice";

/** base, add, step — в копейках. step 0 — не округлять. */
export function markupPrice(base: number, pct: number, add = 0, step = 0) {
  let v = Math.round(base * (1 + pct / 100)) + add;
  if (step > 0) v = Math.ceil(v / step) * step;
  return Math.max(v, 0);
}
