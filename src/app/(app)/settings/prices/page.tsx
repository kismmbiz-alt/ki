import { requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { BUILTIN_PRICES, ensurePriceTypes, priceOptions } from "@/lib/domain/prices";
import { SettingsTabs } from "../tabs";
import { fillBarcodesAction, savePriceDefaultsAction, savePriceTypeAction } from "../config-actions";

function PriceTypeForm({ t }: { t?: { id: string; name: string; forProducts: boolean; forWorks: boolean; sort: number } }) {
  return (
    <Form action={savePriceTypeAction} className="flex flex-wrap items-end gap-3" resetOnOk={!t}>
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Название цены" className="min-w-48 flex-1">
        <Input name="name" defaultValue={t?.name} required placeholder="Например: Оптовая" />
      </Field>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="forProducts" value="1" defaultChecked={t?.forProducts ?? true} /> в товарах
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="forWorks" value="1" defaultChecked={t?.forWorks ?? false} /> в работах
      </label>
      <Field label="Порядок" className="w-20">
        <Input name="sort" defaultValue={String(t?.sort ?? 0)} inputMode="numeric" />
      </Field>
      <Submit variant={t ? "secondary" : "primary"}>{t ? "Сохранить" : "Добавить цену"}</Submit>
      {t && (
        <button name="delete" value="1" className="pb-2 text-sm text-red-600 hover:underline">
          Удалить
        </button>
      )}
    </Form>
  );
}

export default async function PricesPage() {
  const { db, company } = await requirePermission("settings");
  const [types, options, noBarcode] = await Promise.all([
    ensurePriceTypes(db, company.id),
    priceOptions(db, company.id),
    db.product.count({ where: { OR: [{ barcode: null }, { barcode: "" }] } }),
  ]);
  const opts = options.map((o) => (
    <option key={o.key} value={o.key}>
      {o.name}
    </option>
  ));
  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs admin />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Виды цен">
          <p className="mb-3 text-sm text-slate-500">У каждого товара есть встроенные цены. Свои цены (например, «Рассрочка») можно добавить ниже — они появятся в карточке товара и в ценниках.</p>
          <ul className="mb-4 space-y-1 text-sm">
            {BUILTIN_PRICES.map((b) => (
              <li key={b.key} className="flex justify-between rounded-md bg-slate-50 px-3 py-1.5">
                <span>{b.name}</span>
                <span className="text-slate-400">встроенная</span>
              </li>
            ))}
          </ul>
          <div className="space-y-3">
            {types.map((t) => (
              <PriceTypeForm key={t.id} t={t} />
            ))}
            <div className="border-t border-slate-100 pt-3">
              <PriceTypeForm />
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Какая цена ставится по умолчанию">
            <Form action={savePriceDefaultsAction} className="grid gap-3" resetOnOk={false}>
              <Field label="В продаже">
                <Select name="salePriceKey" defaultValue={company.salePriceKey}>
                  {opts}
                </Select>
              </Field>
              <Field label="В заказе (запчасти)">
                <Select name="orderPriceKey" defaultValue={company.orderPriceKey}>
                  {opts}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="hideMinPrice" value="1" defaultChecked={company.hideMinPrice} /> скрывать минимальную цену от сотрудников без права «Продавать ниже минимальной»
              </label>
              <div>
                <Submit>Сохранить</Submit>
              </div>
            </Form>
          </Card>
          <Card title="Штрихкоды">
            <p className="mb-3 text-sm text-slate-500">
              Новым товарам штрихкод выдаётся сам (EAN-13, начинается с 2), если поле пустое. Сканер работает в продаже, в заказе и в складских документах: наведите курсор в поиск и считайте код.
            </p>
            <Form action={fillBarcodesAction}>
              <Submit variant="secondary">Выдать штрихкоды товарам без кода ({noBarcode})</Submit>
            </Form>
          </Card>
        </div>
      </div>
    </>
  );
}
