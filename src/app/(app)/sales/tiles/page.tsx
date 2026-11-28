import { requirePermission } from "@/lib/auth";
import { Card, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { TILE_SLOTS } from "@/lib/domain/sale-tiles";
import { saveSaleTilesAction } from "../actions";
import { SalesTabs } from "../_tabs";

/** Настройка плиток продажи: 4 приоритетных товара и 4 закреплённых частых. */
export default async function SaleTilesPage() {
  const { db } = await requirePermission("settings");
  const [products, tiles] = await Promise.all([
    db.product.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.saleTile.findMany(),
  ]);
  const cur = (side: string, slot: number) => tiles.find((t) => t.side === side && t.slot === slot)?.productId ?? "";
  const Slots = ({ side, empty }: { side: string; empty: string }) => (
    <div className="space-y-2">
      {Array.from({ length: TILE_SLOTS }, (_, i) => (
        <label key={i} className="flex items-center gap-2 text-sm">
          <span className="w-6 text-slate-400">{i + 1}.</span>
          <Select name={`${side}-${i}`} defaultValue={cur(side, i)}>
            <option value="">{empty}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      ))}
    </div>
  );
  return (
    <>
      <PageHeader title="Плитки на экране продажи" back="/sales" />
      <SalesTabs />
      <Form action={saveSaleTilesAction} resetOnOk={false} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Слева: продать в первую очередь">
            <p className="mb-3 text-sm text-slate-500">Товары, которые вы просите сотрудников предлагать. Видны всем на экране продажи, выделены оранжевым.</p>
            <Slots side="PRIORITY" empty="— пусто —" />
          </Card>
          <Card title="Справа: частые товары и услуги">
            <p className="mb-3 text-sm text-slate-500">Пустые места заполняются сами самыми продаваемыми товарами за 60 дней. Выберите товар, чтобы закрепить его на месте.</p>
            <Slots side="FREQUENT" empty="авто: по частоте продаж" />
          </Card>
        </div>
        <Submit>Сохранить плитки</Submit>
      </Form>
    </>
  );
}
