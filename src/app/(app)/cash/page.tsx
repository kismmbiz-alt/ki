import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { CashboxField } from "@/components/place-fields";
import { rub } from "@/lib/money";
import { cashboxBalances, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAY_LABEL } from "@/lib/domain/cash";
import { placesFor } from "@/lib/domain/places";
import { cashAction, transferAction } from "./actions";
import { OpsTable } from "./_ops-table";
import { CashTabs } from "./_tabs";

export default async function CashPage() {
  const ctx = await requirePermission("cash");
  const { db, location, user } = ctx;
  const t = { db, companyId: ctx.company.id };
  const { cashboxes } = await placesFor(t, user.locationId ? location?.id : null, user);
  const here = location ? cashboxes.filter((c) => !c.locationId || c.locationId === location.id) : cashboxes;
  const balances = await cashboxBalances(t, cashboxes.map((c) => c.id));
  const today = new Date(new Date().toDateString());
  const [list, locs] = await Promise.all([
    db.cashTransaction.findMany({
      where: { cashboxId: { in: cashboxes.map((c) => c.id) }, createdAt: { gte: today } },
      include: { user: true, cashbox: true, order: { select: { id: true, number: true } }, sale: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.location.findMany({ select: { id: true, name: true } }),
  ]);
  const locName = new Map(locs.map((l) => [l.id, l.name]));
  const total = cashboxes.reduce((s, c) => s + (balances.get(c.id)?.total ?? 0), 0);
  const income = list.filter((x) => x.amount > 0 && !x.transferId).reduce((s, x) => s + x.amount, 0);
  const expense = list.filter((x) => x.amount < 0 && !x.transferId).reduce((s, x) => s - x.amount, 0);
  const canOps = can(user, "cashOps");
  const canTransfer = can(user, "cashTransfer");

  return (
    <>
      <PageHeader title="Финансы">
        {can(user, "settings") && (
          <Link href="/settings/places" className="text-sm text-blue-600 hover:underline">
            Настроить кассы
          </Link>
        )}
      </PageHeader>
      <CashTabs />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {cashboxes.map((c) => {
          const b = balances.get(c.id)!;
          return (
            <Link key={c.id} href={`/cash/operations?c=${c.id}`} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm">
              <div className="truncate text-sm font-medium text-slate-800">{c.name}</div>
              <div className="text-xs text-slate-400">{c.locationId ? locName.get(c.locationId) : "все точки"}</div>
              <div className={`mt-2 text-2xl font-semibold ${b.total < 0 ? "text-red-600" : "text-slate-900"}`}>{rub(b.total)}</div>
              <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                {(["CASH", "CARD", "TRANSFER"] as const)
                  .filter((m) => b[m])
                  .map((m) => (
                    <div key={m}>
                      {PAY_LABEL[m]}: {rub(b[m])}
                    </div>
                  ))}
              </div>
            </Link>
          );
        })}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-medium text-slate-800">Всего в кассах</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{rub(total)}</div>
          <div className="mt-1 text-xs text-slate-500">
            Сегодня: +{rub(income)} / −{rub(expense)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Операции за сегодня</h2>
            <Link href="/cash/operations" className="text-sm text-blue-600 hover:underline">
              Все операции и фильтры
            </Link>
          </div>
          <OpsTable list={list} />
        </div>
        <div className="space-y-4">
          {canOps && (
            <Card title="Приход или расход">
              <Form action={cashAction} className="space-y-3">
                <Field label="Тип">
                  <Select name="type" defaultValue="expense">
                    <option value="expense">Расход</option>
                    <option value="income">Приход</option>
                  </Select>
                </Field>
                <Field label="Статья">
                  <Input name="category" list="cash-cats" required />
                  <datalist id="cash-cats">
                    {[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Сумма, ₽">
                    <Input name="amount" required inputMode="decimal" />
                  </Field>
                  <Field label="Способ">
                    <Select name="method" defaultValue="CASH">
                      <option value="CASH">Наличные</option>
                      <option value="CARD">Карта</option>
                      <option value="TRANSFER">Перевод</option>
                    </Select>
                  </Field>
                </div>
                <CashboxField cashboxes={here} />
                <Field label="Комментарий">
                  <Input name="comment" />
                </Field>
                <Submit>Записать</Submit>
              </Form>
            </Card>
          )}
          {canTransfer && cashboxes.length > 1 && (
            <Card title="Перевод между кассами">
              <Form action={transferAction} className="space-y-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <Field label="Из кассы">
                    <Select name="fromCashboxId" defaultValue={here[0]?.id}>
                      {cashboxes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <ArrowLeftRight size={16} className="mb-3 text-slate-400" />
                  <Field label="В кассу">
                    <Select name="toCashboxId" defaultValue={cashboxes.find((c) => c.id !== here[0]?.id)?.id}>
                      {cashboxes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Сумма, ₽">
                    <Input name="amount" required inputMode="decimal" />
                  </Field>
                  <Field label="Чем">
                    <Select name="method" defaultValue="CASH">
                      <option value="CASH">Наличные</option>
                      <option value="CARD">Карта</option>
                      <option value="TRANSFER">Перевод</option>
                    </Select>
                  </Field>
                </div>
                <Input name="comment" placeholder="Комментарий (например, инкассация)" />
                <Submit variant="secondary">Перевести</Submit>
              </Form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
