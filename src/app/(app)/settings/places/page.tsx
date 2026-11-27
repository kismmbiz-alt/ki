import { requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { rub } from "@/lib/money";
import { cashboxBalances } from "@/lib/domain/cash";
import { defaultCashboxId, defaultWarehouseId } from "@/lib/domain/places";
import { SettingsTabs } from "../tabs";
import { saveCashboxAction, saveWarehouseAction } from "../places-actions";

export default async function PlacesPage() {
  const { db, company } = await requirePermission("settings");
  const locations = await db.location.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  // у каждой точки должны быть хотя бы одна касса и один склад
  for (const l of locations) {
    await defaultCashboxId(db, l.id);
    await defaultWarehouseId(db, l.id);
  }
  const [cashboxes, warehouses, stockCounts] = await Promise.all([
    db.cashbox.findMany({ orderBy: [{ isActive: "desc" }, { sort: "asc" }, { createdAt: "asc" }] }),
    db.warehouse.findMany({ orderBy: [{ isActive: "desc" }, { sort: "asc" }, { createdAt: "asc" }] }),
    db.stock.groupBy({ by: ["warehouseId"], where: { qty: { gt: 0 } }, _sum: { qty: true } }),
  ]);
  const balances = await cashboxBalances({ db, companyId: company.id }, cashboxes.map((c) => c.id));
  const qtyBy = new Map(stockCounts.map((s) => [s.warehouseId, s._sum.qty ?? 0]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const locOptions = (all: boolean) => (
    <>
      {all && <option value="">Все точки (общая касса)</option>}
      {locations.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </>
  );
  const boxOptions = (
    <>
      <option value="">Касса точки по умолчанию</option>
      {cashboxes
        .filter((c) => c.isActive)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.locationId ? ` · ${locName.get(c.locationId) ?? ""}` : " · все точки"}
          </option>
        ))}
    </>
  );

  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs />
      <p className="mb-4 max-w-3xl text-sm text-slate-500">
        Касс и складов может быть сколько угодно. У склада можно выбрать кассу: продажи с этого склада по умолчанию пойдут в неё. Общая касса (например, расчётный счёт) видна во всех
        точках.
      </p>

      <h2 className="mb-2 text-base font-semibold text-slate-900">Кассы</h2>
      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cashboxes.map((c) => (
          <Card key={c.id} title={`${c.name}${c.isActive ? "" : " (отключена)"}`} actions={<span className="text-sm font-semibold text-slate-700">{rub(balances.get(c.id)?.total ?? 0)}</span>}>
            <Form action={saveCashboxAction} className="space-y-2" resetOnOk={false}>
              <input type="hidden" name="id" value={c.id} />
              <Field label="Название">
                <Input name="name" defaultValue={c.name} />
              </Field>
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <Field label="Точка">
                  <Select name="locationId" defaultValue={c.locationId ?? ""}>
                    {locOptions(true)}
                  </Select>
                </Field>
                <Field label="Порядок">
                  <Input name="sort" defaultValue={String(c.sort)} inputMode="numeric" />
                </Field>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" value="1" defaultChecked={c.isActive} /> работает
                </label>
                <Submit variant="secondary">Сохранить</Submit>
              </div>
            </Form>
          </Card>
        ))}
        <Card title="Новая касса">
          <Form action={saveCashboxAction} className="space-y-2">
            <Field label="Название *">
              <Input name="name" required placeholder="Например: Карта Сбер, Расчётный счёт" />
            </Field>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Field label="Точка">
                <Select name="locationId" defaultValue={locations[0]?.id ?? ""}>
                  {locOptions(true)}
                </Select>
              </Field>
              <Field label="Порядок">
                <Input name="sort" defaultValue="0" inputMode="numeric" />
              </Field>
            </div>
            <Submit>Добавить кассу</Submit>
          </Form>
        </Card>
      </div>

      <h2 className="mb-2 text-base font-semibold text-slate-900">Склады</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {warehouses.map((w) => (
          <Card key={w.id} title={`${w.name}${w.isActive ? "" : " (отключён)"}`} actions={<span className="text-sm text-slate-500">{qtyBy.get(w.id) ?? 0} шт</span>}>
            <Form action={saveWarehouseAction} className="space-y-2" resetOnOk={false}>
              <input type="hidden" name="id" value={w.id} />
              <Field label="Название">
                <Input name="name" defaultValue={w.name} />
              </Field>
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <Field label="Точка">
                  <Select name="locationId" defaultValue={w.locationId}>
                    {locOptions(false)}
                  </Select>
                </Field>
                <Field label="Порядок">
                  <Input name="sort" defaultValue={String(w.sort)} inputMode="numeric" />
                </Field>
              </div>
              <Field label="Касса для продаж с этого склада">
                <Select name="cashboxId" defaultValue={w.cashboxId ?? ""}>
                  {boxOptions}
                </Select>
              </Field>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" value="1" defaultChecked={w.isActive} /> работает
                </label>
                <Submit variant="secondary">Сохранить</Submit>
              </div>
            </Form>
          </Card>
        ))}
        <Card title="Новый склад">
          <Form action={saveWarehouseAction} className="space-y-2">
            <Field label="Название *">
              <Input name="name" required placeholder="Например: Аксессуары, Б/у техника, Айфоны" />
            </Field>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Field label="Точка">
                <Select name="locationId" defaultValue={locations[0]?.id ?? ""}>
                  {locOptions(false)}
                </Select>
              </Field>
              <Field label="Порядок">
                <Input name="sort" defaultValue="0" inputMode="numeric" />
              </Field>
            </div>
            <Field label="Касса для продаж">
              <Select name="cashboxId" defaultValue="">
                {boxOptions}
              </Select>
            </Field>
            <Submit>Добавить склад</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
