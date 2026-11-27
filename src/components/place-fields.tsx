import { Field, Select } from "./ui";

type Opt = { id: string; name: string };

/** Выбор склада: если склад один — просто скрытое поле. */
export function WarehouseField({ warehouses, defaultValue, label = "Склад", name = "warehouseId" }: { warehouses: Opt[]; defaultValue?: string | null; label?: string; name?: string }) {
  if (warehouses.length <= 1) return warehouses[0] ? <input type="hidden" name={name} value={warehouses[0].id} /> : null;
  return (
    <Field label={label}>
      <Select name={name} defaultValue={defaultValue ?? warehouses[0].id}>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Выбор кассы: если касса одна — просто скрытое поле. */
export function CashboxField({ cashboxes, defaultValue, label = "Касса", name = "cashboxId" }: { cashboxes: Opt[]; defaultValue?: string | null; label?: string; name?: string }) {
  if (cashboxes.length <= 1) return cashboxes[0] ? <input type="hidden" name={name} value={cashboxes[0].id} /> : null;
  return (
    <Field label={label}>
      <Select name={name} defaultValue={defaultValue ?? cashboxes[0].id}>
        {cashboxes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
