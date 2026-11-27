import { Field, Input, Select } from "@/components/ui";
import { kopToInput } from "@/lib/money";
import { flattenGroups, indentLabel } from "@/lib/domain/groups";

type G = { id: string; name: string; parentId: string | null };
type P = {
  name?: string;
  sku?: string | null;
  barcode?: string | null;
  price?: number;
  repairPrice?: number | null;
  minPrice?: number | null;
  cost?: number;
  minQty?: number;
  prices?: { priceTypeId: string; value: number }[];
  groupId?: string | null;
  supplierId?: string | null;
};

/** Группы списком: подгруппы с отступом, обычным текстом. */
export function groupOptions(groups: G[]) {
  return flattenGroups(groups).map((g) => ({ id: g.id, label: indentLabel(g.name, g.depth) }));
}

export function ProductFields({
  p = {},
  groups,
  suppliers,
  defaultGroupId,
  priceTypes = [],
  showCost = true,
}: {
  showCost?: boolean;
  p?: P;
  groups: G[];
  suppliers: { id: string; name: string }[];
  defaultGroupId?: string;
  priceTypes?: { id: string; name: string }[];
}) {
  return (
    <>
      <Field label="Название *">
        <Input name="name" required defaultValue={p.name} placeholder="Дисплей iPhone 11 (оригинал)" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Группа">
          <Select name="groupId" defaultValue={p.groupId ?? defaultGroupId ?? ""}>
            <option value="">Без группы</option>
            {groupOptions(groups).map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Поставщик">
          <Select name="supplierId" defaultValue={p.supplierId ?? ""}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Код / артикул">
          <Input name="sku" defaultValue={p.sku ?? ""} />
        </Field>
        <Field label="Штрихкод" hint={p.name ? undefined : "пусто — создадим сами"}>
          <Input name="barcode" defaultValue={p.barcode ?? ""} placeholder="отсканируйте или оставьте пустым" />
        </Field>
        <Field label="Розничная цена, ₽ *" hint="для продажи">
          <Input name="price" inputMode="decimal" required defaultValue={kopToInput(p.price)} />
        </Field>
        <Field label="Ремонтная цена, ₽" hint="подставляется в заказ">
          <Input name="repairPrice" inputMode="decimal" defaultValue={kopToInput(p.repairPrice)} />
        </Field>
        <Field label="Минимальная цена, ₽" hint="дешевле продать нельзя">
          <Input name="minPrice" inputMode="decimal" defaultValue={kopToInput(p.minPrice)} />
        </Field>
        {showCost && (
          <Field label="Закупочная цена, ₽" hint="средняя, меняется при поступлении">
            <Input name="cost" inputMode="decimal" defaultValue={p.cost ? kopToInput(p.cost) : ""} />
          </Field>
        )}
        {priceTypes.map((t) => (
          <Field key={t.id} label={`${t.name}, ₽`}>
            <Input name={`pt_${t.id}`} inputMode="decimal" defaultValue={kopToInput(p.prices?.find((x) => x.priceTypeId === t.id)?.value ?? null)} />
          </Field>
        ))}
        <Field label="Мин. остаток, шт" hint="ниже — «заканчивается»">
          <Input name="minQty" inputMode="numeric" defaultValue={p.minQty || ""} />
        </Field>
      </div>
    </>
  );
}
