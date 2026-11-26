import { can, requirePermission } from "@/lib/auth";
import { toCsv } from "@/lib/csv";

/** Выгрузка товаров и остатков в CSV для Excel. */
export async function GET() {
  const { db, location, user } = await requirePermission("stock");
  const products = await db.product.findMany({ where: { isActive: true }, include: { stocks: true, group: true, supplier: true }, orderBy: { name: "asc" } });
  const showCost = can(user.role, "reports");
  const k = (v: number | null | undefined) => (v == null ? "" : v / 100);
  const rows = products.map((p) => [
    p.name,
    p.sku ?? "",
    p.barcode ?? "",
    p.group?.name ?? "",
    p.supplier?.name ?? "",
    p.stocks.find((s) => s.locationId === location?.id)?.qty ?? 0,
    p.stocks.reduce((s, x) => s + x.qty, 0),
    p.minQty,
    ...(showCost ? [k(p.cost)] : []),
    k(p.price),
    k(p.repairPrice),
    k(p.minPrice),
  ]);
  const csv = toCsv(
    ["Наименование", "Код", "Штрихкод", "Группа", "Поставщик", "Остаток на точке", "Остаток всего", "Мин. остаток", ...(showCost ? ["Закупочная"] : []), "Розничная", "Ремонтная", "Минимальная"],
    rows,
  );
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="stock-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
