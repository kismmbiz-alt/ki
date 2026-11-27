import type { Tenant, Tx } from "../db";
import { DEFAULT_POSITIONS } from "../perms";

type Db = Tx | Tenant["db"];

/** Касса по умолчанию для точки: первая активная касса точки или общая касса компании. Если касс нет — создаёт. */
export async function defaultCashboxId(tx: Db, locationId: string) {
  const own = await tx.cashbox.findFirst({ where: { locationId, isActive: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  if (own) return own.id;
  const shared = await tx.cashbox.findFirst({ where: { locationId: null, isActive: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  if (shared) return shared.id;
  const loc = await tx.location.findUniqueOrThrow({ where: { id: locationId } });
  const c = await tx.cashbox.create({ data: { companyId: loc.companyId, locationId, name: "Основная касса" } });
  return c.id;
}

/** Склад по умолчанию для точки: первый активный склад. Если складов нет — создаёт. */
export async function defaultWarehouseId(tx: Db, locationId: string) {
  const w = await tx.warehouse.findFirst({ where: { locationId, isActive: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  if (w) return w.id;
  const loc = await tx.location.findUniqueOrThrow({ where: { id: locationId } });
  const cashboxId = await defaultCashboxId(tx, locationId);
  const created = await tx.warehouse.create({ data: { companyId: loc.companyId, locationId, cashboxId, name: "Основной склад" } });
  return created.id;
}

/** Касса для операции: выбранная (проверяем, что она своя и активна) или по умолчанию. */
export async function resolveCashbox(tx: Db, locationId: string, cashboxId?: string | null) {
  if (!cashboxId) return defaultCashboxId(tx, locationId);
  const c = await tx.cashbox.findUniqueOrThrow({ where: { id: cashboxId } });
  if (!c.isActive) throw new Error(`Касса «${c.name}» отключена`);
  if (c.locationId && c.locationId !== locationId) throw new Error(`Касса «${c.name}» относится к другой точке`);
  return c.id;
}

/** Склад для операции: выбранный (проверяем, что он из этой точки) или по умолчанию. */
export async function resolveWarehouse(tx: Db, locationId: string, warehouseId?: string | null) {
  if (!warehouseId) return defaultWarehouseId(tx, locationId);
  const w = await tx.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
  if (w.locationId !== locationId) throw new Error(`Склад «${w.name}» относится к другой точке`);
  return w.id;
}

/** Склады и кассы, доступные в точке. */
export async function placesFor({ db }: Tenant, locationId?: string | null) {
  const [warehouses, cashboxes] = await Promise.all([
    db.warehouse.findMany({ where: { isActive: true, ...(locationId ? { locationId } : {}) }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    db.cashbox.findMany({
      where: { isActive: true, ...(locationId ? { OR: [{ locationId }, { locationId: null }] } : {}) },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return { warehouses, cashboxes };
}

/** Создаёт стандартные должности, если в компании их ещё нет. */
export async function ensurePositions({ db, companyId }: Tenant) {
  if (await db.position.count()) return;
  await db.position.createMany({ data: DEFAULT_POSITIONS.map((p, i) => ({ companyId, name: p.name, baseRole: p.baseRole, perms: p.perms, sort: i })) });
}
