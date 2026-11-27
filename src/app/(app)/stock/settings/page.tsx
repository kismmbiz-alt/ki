import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { btn, PageHeader } from "@/components/ui";
import { rub } from "@/lib/money";
import { StockTabs } from "../_ui/tabs";

/** Настройки склада: все склады с остатком и суммой по закупке, как в LiveSklad. */
export default async function StockSettingsPage() {
  const { db, user } = await requirePermission("stock");
  const [warehouses, stocks] = await Promise.all([
    db.warehouse.findMany({ where: { isActive: true }, include: { location: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    db.stock.findMany({ where: { qty: { gt: 0 } }, select: { warehouseId: true, qty: true, product: { select: { cost: true, price: true } } } }),
  ]);
  const showCost = can(user, "cost");
  const manage = can(user, "settings");
  const sum = (id: string) =>
    stocks
      .filter((s) => s.warehouseId === id)
      .reduce((a, s) => ({ qty: a.qty + s.qty, cost: a.cost + s.qty * s.product.cost, retail: a.retail + s.qty * s.product.price }), { qty: 0, cost: 0, retail: 0 });
  return (
    <>
      <PageHeader title="Настройки склада">
        {manage && (
          <Link href="/settings/places" className={btn()}>
            <Plus size={16} /> Добавить склад
          </Link>
        )}
      </PageHeader>
      <StockTabs />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {warehouses.map((w) => {
          const t = sum(w.id);
          return (
            <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{w.name}</div>
                  <div className="text-xs text-slate-500">{w.location.name}</div>
                </div>
                {manage && (
                  <Link href="/settings/places" className="text-slate-400 hover:text-blue-600" title="Изменить склад">
                    <Pencil size={15} />
                  </Link>
                )}
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-500">Остаток</span>
                <span>{t.qty} шт.</span>
              </div>
              {showCost && (
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-slate-500">По закупочной цене</span>
                  <span>{rub(t.cost)}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">По розничной цене</span>
                <span>{rub(t.retail)}</span>
              </div>
              <Link href={`/stock?w=${w.id}`} className="mt-2 inline-block text-xs text-blue-600">
                Открыть остатки
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
