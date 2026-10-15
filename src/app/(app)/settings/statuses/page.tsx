import { requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SettingsTabs } from "../tabs";
import { saveStatusAction } from "../actions";

const KIND_LABEL = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  WAITING: "Ожидание",
  READY: "Готов к выдаче",
  CLOSED: "Выдан (закрыт)",
  CANCELED: "Отказ (закрыт)",
} as const;

function StatusForm({ s }: { s?: { id: string; name: string; color: string; kind: keyof typeof KIND_LABEL; sort: number } }) {
  return (
    <Form action={saveStatusAction} className="grid grid-cols-[1fr_9rem_4rem_4rem_auto] items-end gap-2" resetOnOk={!s}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field label="Название">
        <Input name="name" defaultValue={s?.name} required />
      </Field>
      <Field label="Тип">
        <Select name="kind" defaultValue={s?.kind ?? "IN_PROGRESS"}>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Цвет">
        <input type="color" name="color" defaultValue={s?.color ?? "#64748b"} className="h-9 w-full rounded-md border border-slate-300" />
      </Field>
      <Field label="Порядок">
        <Input name="sort" defaultValue={String(s?.sort ?? 99)} />
      </Field>
      <Submit variant={s ? "secondary" : "primary"}>{s ? "Сохранить" : "Добавить"}</Submit>
    </Form>
  );
}

export default async function StatusesPage() {
  const { db } = await requirePermission("settings");
  const statuses = await db.orderStatus.findMany({ orderBy: { sort: "asc" } });
  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs admin />
      <Card title="Статусы заказов">
        <div className="space-y-3">
          {statuses.map((s) => (
            <StatusForm key={s.id} s={s} />
          ))}
          <div className="border-t border-slate-100 pt-3">
            <StatusForm />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Тип статуса определяет поведение: «Выдан» закрывает заказ и требует полной оплаты, «Готов» показывает заказ во вкладке «Готовы».
        </p>
      </Card>
    </>
  );
}
