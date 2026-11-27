import type { Product, ProductPrice } from "@prisma/client";
import type { TenantDb } from "@/lib/db";

type Db = TenantDb;

/** Цены, которые хранятся прямо в товаре. */
export const BUILTIN_PRICES = [
  { key: "retail", name: "Розничная (продажная)", field: "price" },
  { key: "repair", name: "Ремонтная (в заказ)", field: "repairPrice" },
  { key: "min", name: "Минимальная", field: "minPrice" },
  { key: "cost", name: "Закупочная", field: "cost" },
] as const;
export type BuiltinKey = (typeof BUILTIN_PRICES)[number]["key"];
export const isBuiltin = (k: string): k is BuiltinKey => BUILTIN_PRICES.some((b) => b.key === k);

/** У новой компании сразу есть цена «Рассрочка». */
export async function ensurePriceTypes(db: Db, companyId: string) {
  const n = await db.priceType.count({ where: { companyId } });
  if (!n) await db.priceType.create({ data: { companyId, name: "Рассрочка", forProducts: true, forWorks: false, sort: 0 } });
  return db.priceType.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
}

/** Все виды цен для выбора: встроенные + свои. */
export async function priceOptions(db: Db, companyId: string) {
  const custom = await ensurePriceTypes(db, companyId);
  return [...BUILTIN_PRICES.map((b) => ({ key: b.key as string, name: b.name })), ...custom.map((c) => ({ key: c.id, name: c.name }))];
}

/** Цена товара по ключу вида цены (коп.). Если своей цены нет — розничная. */
export function priceOf(p: Pick<Product, "price" | "repairPrice" | "minPrice" | "cost"> & { prices?: Pick<ProductPrice, "priceTypeId" | "value">[] }, key: string): number {
  switch (key) {
    case "retail":
      return p.price;
    case "repair":
      return p.repairPrice ?? p.price;
    case "min":
      return p.minPrice ?? p.price;
    case "cost":
      return p.cost;
    default:
      return p.prices?.find((x) => x.priceTypeId === key)?.value ?? p.price;
  }
}

/** Сохранить свои цены товара: values — { priceTypeId: коп. | null }. */
export async function saveProductPrices(db: Db, companyId: string, productId: string, values: Record<string, number | null>) {
  for (const [priceTypeId, value] of Object.entries(values)) {
    if (value == null) {
      await db.productPrice.deleteMany({ where: { companyId, productId, priceTypeId } });
    } else {
      await db.productPrice.upsert({
        where: { companyId_productId_priceTypeId: { companyId, productId, priceTypeId } },
        create: { companyId, productId, priceTypeId, value },
        update: { value },
      });
    }
  }
}
