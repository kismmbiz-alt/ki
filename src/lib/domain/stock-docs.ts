// Списки складских документов с фильтрами как в LiveSklad: поиск, склад, период.

import type { Prisma, StockDocType } from "@prisma/client";
import type { TenantDb } from "@/lib/db";

export type DocFilter = { q?: string; from?: string; to?: string; wh?: string };

export function docWhere(types: StockDocType[], locationId: string | null | undefined, f: DocFilter): Prisma.StockDocWhereInput {
  const and: Prisma.StockDocWhereInput[] = [{ type: { in: types } }];
  if (locationId) and.push({ OR: [{ locationId }, { toLocationId: locationId }] });
  if (f.wh) and.push({ OR: [{ warehouseId: f.wh }, { toWarehouseId: f.wh }] });
  const created: Prisma.DateTimeFilter = {};
  if (f.from) created.gte = new Date(`${f.from}T00:00:00`);
  if (f.to) created.lt = new Date(new Date(`${f.to}T00:00:00`).getTime() + 864e5);
  if (f.from || f.to) and.push({ createdAt: created });
  const q = f.q?.trim();
  if (q) {
    const n = Number(q.replace(/^№/, ""));
    and.push({
      OR: [
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
        { inDocNo: { contains: q, mode: "insensitive" } },
        { comment: { contains: q, mode: "insensitive" } },
        { supplier: { name: { contains: q, mode: "insensitive" } } },
        { client: { name: { contains: q, mode: "insensitive" } } },
        { items: { some: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  return { AND: and };
}

export const findDocs = (db: TenantDb, types: StockDocType[], locationId: string | null | undefined, f: DocFilter, take = 500) =>
  db.stockDoc.findMany({
    where: docWhere(types, locationId, f),
    include: { warehouse: true, toWarehouse: { include: { location: true } }, supplier: true, client: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
