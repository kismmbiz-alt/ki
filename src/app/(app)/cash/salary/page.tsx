import Link from "next/link";
import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select, dOnly } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { CashboxField } from "@/components/place-fields";
import { rub } from "@/lib/money";
import { placesFor } from "@/lib/domain/places";
import { salarySheet } from "@/lib/domain/salary";
import { addSalaryEntryAction, deleteSalaryEntryAction } from "../../settings/config-actions";
import { CashTabs } from "../_tabs";

const KIND = { BONUS: "Бонус", FINE: "Штраф", PAYOUT: "Выплата" } as Record<string, string>;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function SalaryPage({ searchParams }: { searchParams: Promise<{ m?: string; user?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const { db, user, company, location } = ctx;
  if (!can(user, "cash") && !can(user, "users")) redirect("/dashboard");
  const now = new Date();
  const [y, mo] = (sp.m ?? `${now.getFullYear()}-${now.getMonth() + 1}`).split("-").map(Number);
  const from = new Date(y || now.getFullYear(), (mo || now.getMonth() + 1) - 1, 1);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const month = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(from.getFullYear(), from.getMonth() - 1, 1);
  const next = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const mStr = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;

  const staff = await db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const sheets = (await Promise.all(staff.map((u) => salarySheet(db, company, u.id, from, to)))).filter((x) => !!x);
  const sel = sp.user ? sheets.find((s) => s.user.id === sp.user) : null;
  const { cashboxes } = await placesFor({ db, companyId: company.id }, location?.id, user);
  const canPay = can(user, "cashOps");
  const sum = (k: "salary" | "accrued" | "bonus" | "fine" | "total" | "paid" | "due") => sheets.reduce((s, x) => s + x[k], 0);
  const period = `from=${ymd(from)}&to=${ymd(new Date(to.getTime() - 86400000))}`;

  return (
    <>
      <PageHeader title="Финансы" />
      <CashTabs />
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href={`/cash/salary?m=${mStr(prev)}${sp.user ? `&user=${sp.user}` : ""}`} className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-100">
          ←
        </Link>
        <b className="capitalize">{from.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</b>
        <Link href={`/cash/salary?m=${mStr(next)}${sp.user ? `&user=${sp.user}` : ""}`} className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-100">
          →
        </Link>
      </div>
      <Card title="Зарплата сотрудников за месяц">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                {["Сотрудник", "Оклад", "Начисления", "Бонусы", "Штрафы", "Итого", "Выплачено", "К выплате", ""].map((h) => (
                  <th key={h} className="px-2 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sheets.map((s) => (
                <tr key={s.user.id} className={s.user.id === sp.user ? "bg-blue-50" : ""}>
                  <td className="px-2 py-2">
                    <Link href={`/cash/salary?m=${month}&user=${s.user.id}`} className="text-blue-600 hover:underline">
                      {s.user.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{rub(s.salary)}</td>
                  <td className="px-2 py-2">{rub(s.accrued)}</td>
                  <td className="px-2 py-2 text-green-700">{rub(s.bonus)}</td>
                  <td className="px-2 py-2 text-red-600">{rub(s.fine)}</td>
                  <td className="px-2 py-2 font-medium">{rub(s.total)}</td>
                  <td className="px-2 py-2">{rub(s.paid)}</td>
                  <td className={`px-2 py-2 font-semibold ${s.due > 0 ? "text-amber-700" : ""}`}>{rub(s.due)}</td>
                  <td className="px-2 py-2">
                    <a href={`/print/t?salary=${s.user.id}&${period}`} target="_blank" title="Печать РКО / ведомости" className="text-slate-500 hover:text-slate-800">
                      <Printer size={16} />
                    </a>
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-2 py-2">Всего</td>
                <td className="px-2 py-2">{rub(sum("salary"))}</td>
                <td className="px-2 py-2">{rub(sum("accrued"))}</td>
                <td className="px-2 py-2">{rub(sum("bonus"))}</td>
                <td className="px-2 py-2">{rub(sum("fine"))}</td>
                <td className="px-2 py-2">{rub(sum("total"))}</td>
                <td className="px-2 py-2">{rub(sum("paid"))}</td>
                <td className="px-2 py-2">{rub(sum("due"))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Начисления считаются по правилам в карточке сотрудника (Настройки → Сотрудники → Полная карточка): за выполненные заказы и за продажи. Изменили правила — цифры пересчитаются сами.
        </p>
      </Card>

      {sel && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card title={`${sel.user.name}: из чего сложилась зарплата`}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {sel.salary > 0 && (
                  <tr>
                    <td className="py-1.5">Оклад</td>
                    <td />
                    <td className="py-1.5 text-right">{rub(sel.salary)}</td>
                  </tr>
                )}
                {sel.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1.5">
                      {dOnly(r.date)} · {r.label}
                    </td>
                    <td className="py-1.5 text-right text-xs text-slate-400">база {rub(r.base)}</td>
                    <td className={`py-1.5 text-right ${r.amount < 0 ? "text-red-600" : ""}`}>{rub(r.amount)}</td>
                  </tr>
                ))}
                {sel.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1.5">
                      {dOnly(e.date)} · {KIND[e.kind]}
                      {e.comment ? `: ${e.comment}` : ""}
                    </td>
                    <td className="py-1.5 text-right">
                      {!e.cashTxId && can(user, "users") && (
                        <Form action={deleteSalaryEntryAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button className="text-xs text-red-600 hover:underline">удалить</button>
                        </Form>
                      )}
                    </td>
                    <td className={`py-1.5 text-right ${e.kind === "BONUS" ? "text-green-700" : "text-red-600"}`}>
                      {e.kind === "BONUS" ? "+" : "−"}
                      {rub(e.amount)}
                    </td>
                  </tr>
                ))}
                {!sel.rows.length && !sel.entries.length && !sel.salary && (
                  <tr>
                    <td className="py-2 text-slate-400">За этот месяц начислений нет</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 font-semibold">
              <span>К выплате</span>
              <span>{rub(sel.due)}</span>
            </div>
          </Card>
          <Card title="Бонус, штраф или выплата">
            <Form action={addSalaryEntryAction} className="grid gap-2">
              <input type="hidden" name="userId" value={sel.user.id} />
              <Field label="Что">
                <Select name="kind" defaultValue="PAYOUT">
                  <option value="PAYOUT">Выплата зарплаты</option>
                  <option value="BONUS">Бонус</option>
                  <option value="FINE">Штраф</option>
                </Select>
              </Field>
              <Field label="Сумма, ₽">
                <Input name="amount" inputMode="decimal" defaultValue={sel.due > 0 ? String(sel.due / 100) : ""} required />
              </Field>
              <Field label="Дата">
                <Input name="date" type="date" defaultValue={ymd(now < to && now >= from ? now : new Date(to.getTime() - 86400000))} />
              </Field>
              <Field label="Комментарий">
                <Input name="comment" />
              </Field>
              {canPay && (
                <>
                  <CashboxField cashboxes={cashboxes} label="Касса для выплаты" />
                  <Field label="Способ">
                    <Select name="method" defaultValue="CASH">
                      <option value="CASH">Наличные</option>
                      <option value="CARD">Карта</option>
                      <option value="TRANSFER">Перевод</option>
                    </Select>
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="fromCash" value="1" defaultChecked /> выплату провести расходом из кассы («Зарплата»)
                  </label>
                  <input type="hidden" name="fromCash" value="0" />
                </>
              )}
              {!canPay && <input type="hidden" name="fromCash" value="0" />}
              <Submit>Записать</Submit>
            </Form>
          </Card>
        </div>
      )}
    </>
  );
}
