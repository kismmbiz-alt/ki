// Плитки на экране продажи: по 4 слева (приоритет от начальства) и справа (частые товары).

import type { TenantDb } from "@/lib/db";

export const TILE_SLOTS = 4;

/** Слева — выбранные руководителем; справа — закреплённые вручную, остальные места по частоте продаж за 60 дней. */
export async function saleTiles(db: TenantDb, available: Set<string>) {
  const tiles = await db.saleTile.findMany();
  const slot = (side: string) => Array.from({ length: TILE_SLOTS }, (_, i) => tiles.find((t) => t.side === side && t.slot === i)?.productId ?? null);
  const priority = slot("PRIORITY");
  const pinned = slot("FREQUENT");
  const since = new Date(Date.now() - 60 * 864e5);
  const top = await db.saleItem.groupBy({ by: ["productId"], where: { sale: { createdAt: { gte: since }, isReturn: false } }, _sum: { qty: true }, orderBy: { _sum: { qty: "desc" } }, take: 30 });
  const used = new Set([...priority, ...pinned].filter(Boolean));
  const auto = top.map((t) => t.productId).filter((id) => available.has(id) && !used.has(id));
  const frequent = pinned.map((id) => (id ? { id, pinned: true } : null));
  for (let i = 0; i < TILE_SLOTS; i++) if (!frequent[i]) {
    const id = auto.shift();
    frequent[i] = id ? { id, pinned: false } : null;
  }
  return { priority, frequent };
}
