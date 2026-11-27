import type { OrderStatus, Position } from "@prisma/client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { ensurePositions } from "@/lib/domain/places";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SettingsTabs } from "../tabs";
import { moveStatusAction, saveStatusChainsAction, saveStatusFullAction } from "../config-actions";

const KIND_LABEL = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  WAITING: "Ожидание",
  READY: "Готов к выдаче",
  CLOSED: "Выдан (закрыт)",
  CANCELED: "Отказ (закрыт)",
} as const;

function Checks({ name, items, checked }: { name: string; items: { id: string; name: string }[]; checked: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((i) => (
        <label key={i.id} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name={name} value={i.id} defaultChecked={checked.includes(i.id)} /> {i.name}
        </label>
      ))}
    </div>
  );
}

function StatusForm({ s, all, positions, chains }: { s?: OrderStatus; all: OrderStatus[]; positions: Position[]; chains: boolean }) {
  return (
    <Form action={saveStatusFullAction} className="space-y-3" resetOnOk={!s}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_4rem]">
        <Field label="Название">
          <Input name="name" defaultValue={s?.name} required />
        </Field>
        <Field label="Группа (поведение)">
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
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Как видит клиент (на странице статуса)" hint="пусто — как название">
          <Input name="widgetName" defaultValue={s?.widgetName ?? ""} />
        </Field>
        <Field label="Дедлайн в статусе, часов" hint="заказ подсветится красным, если пробыл дольше">
          <Input name="deadlineHours" defaultValue={s?.deadlineHours ? String(s.deadlineHours) : ""} inputMode="numeric" />
        </Field>
      </div>
      <Field label="Комментарий для сотрудников">
        <Textarea name="comment" rows={2} defaultValue={s?.comment ?? ""} />
      </Field>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="requirePayment" value="1" defaultChecked={s?.requirePayment} /> требовать полную оплату при переходе
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="requireMaster" value="1" defaultChecked={s?.requireMaster} /> требовать назначенного мастера
        </label>
      </div>
      {s && (
        <div className={`rounded-lg p-3 ${chains ? "bg-blue-50" : "bg-slate-50"}`}>
          <div className="mb-1 text-sm font-medium text-slate-700">Куда можно перевести из этого статуса {chains ? "" : "(включите цепочки ниже, чтобы это работало)"}</div>
          <Checks name="nextIds" items={all.filter((x) => x.id !== s.id)} checked={s.nextIds} />
        </div>
      )}
      <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Не может ставить статус</div>
          <Checks name="denySet" items={positions} checked={s?.denySet ?? []} />
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Не видит заказы в статусе</div>
          <Checks name="denySee" items={positions} checked={s?.denySee ?? []} />
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Не может менять заказ</div>
          <Checks name="denyEdit" items={positions} checked={s?.denyEdit ?? []} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Submit variant={s ? "secondary" : "primary"}>{s ? "Сохранить" : "Добавить статус"}</Submit>
        {s && (
          <button name="delete" value="1" className="text-sm text-red-600 hover:underline">
            Удалить
          </button>
        )}
      </div>
    </Form>
  );
}

export default async function StatusesPage() {
  const { db, company } = await requirePermission("settings");
  await ensurePositions({ db, companyId: company.id });
  const [statuses, positions] = await Promise.all([
    db.orderStatus.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] }),
    db.position.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
  ]);
  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs admin />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card title="Статусы заказов (по порядку)">
          <div className="divide-y divide-slate-100">
            {statuses.map((s, i) => (
              <details key={s.id} className="py-2">
                <summary className="flex cursor-pointer items-center gap-3">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: s.color }} />
                  <span className="flex-1 font-medium">{s.name}</span>
                  <span className="text-xs text-slate-400">
                    {KIND_LABEL[s.kind]}
                    {s.deadlineHours ? ` · ${s.deadlineHours} ч` : ""}
                    {s.requirePayment ? " · оплата" : ""}
                  </span>
                  <form action={moveStatusAction} className="flex">
                    <input type="hidden" name="id" value={s.id} />
                    <button name="dir" value="up" disabled={i === 0} title="Выше" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                      <ArrowUp size={14} />
                    </button>
                    <button name="dir" value="down" disabled={i === statuses.length - 1} title="Ниже" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                      <ArrowDown size={14} />
                    </button>
                  </form>
                </summary>
                <div className="mt-3 pl-6">
                  <StatusForm s={s} all={statuses} positions={positions} chains={company.statusChains} />
                </div>
              </details>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Цепочки статусов">
            <Form action={saveStatusChainsAction} resetOnOk={false} className="space-y-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="statusChains" value="1" defaultChecked={company.statusChains} className="mt-1" />
                <span>Переводить заказ только по цепочке: из каждого статуса — только в отмеченные статусы («Куда можно перевести»).</span>
              </label>
              <Submit variant="secondary">Сохранить</Submit>
            </Form>
          </Card>
          <Card title="Новый статус">
            <StatusForm all={statuses} positions={positions} chains={company.statusChains} />
          </Card>
          <p className="text-xs text-slate-500">
            Группа определяет поведение: «Выдан» закрывает заказ и требует полной оплаты, «Готов» показывает заказ во вкладке «Готовы». Права по статусам действуют для должностей; владелец может всё.
          </p>
        </div>
      </div>
    </>
  );
}
