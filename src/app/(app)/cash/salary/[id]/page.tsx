import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, ThumbsDown, ThumbsUp, Wallet, X } from "lucide-react";
import { can } from "@/lib/auth";
import { btn, Field, Input, Select, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { rub } from "@/lib/money";
import { placesFor } from "@/lib/domain/places";
import { salarySheet, type SalaryRow } from "@/lib/domain/salary";
import { addSalaryEntryAction, deleteSalaryEntryAction } from "../../../settings/config-actions";
import { salaryCtx } from "../_shared";

type SP = { tab?: string; p?: string; loc?: string; add?: string; ap?: string; ev?: string };
const KIND = { BONUS: "Бонус", FINE: "Штраф", PAYOUT: "Выплата" } as Record<string, string>;
const n2 = (k: number) => (k / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (d: Date) => d.toLocaleDateString("sv-SE");

type Ev = { key: string; type: string; group: string; date: Date; number?: string; href?: string; client?: string | null; items?: { name: string; qty: number }[]; formula?: string; amount: number; entryId?: string; paid?: boolean; comment?: string | null };

/** Карточка зарплаты сотрудника как в LiveSklad: начисления по периодам, выплаты, события, создать бонус / штраф / выплату. */
export default async function EmployeeSalaryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { db, company, user, location, periods } = await salaryCtx();
  const emp = await db.user.findUnique({ where: { id } });
  if (!emp) notFound();
  const loc = sp.loc || null;
  const sheets = (await Promise.all(periods.map(async (p) => ({ p, s: (await salarySheet(db, company, id, p.from, p.to, loc))! })))).filter((x) => x.s);
  const tab = sp.tab ?? "acc";
  const sel = sheets.find((x) => x.p.key === sp.p) ?? sheets[0];
  const sum = (k: "salary" | "accrued" | "bonus" | "fine" | "total" | "paid" | "due") => sheets.reduce((a, x) => a + x.s[k], 0);
  const base = `/cash/salary/${id}`;
  const q = (o: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ tab, p: sp.p, loc: sp.loc, ...o }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${u}`;
  };
  const [locations, places, payouts] = await Promise.all([
    db.location.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    placesFor({ db, companyId: company.id }, location?.id, user),
    db.salaryEntry.findMany({ where: { userId: id, kind: "PAYOUT" }, orderBy: { date: "desc" }, take: 300 }),
  ]);
  const payTx = await db.cashTransaction.findMany({ where: { id: { in: payouts.map((p) => p.cashTxId).filter((x): x is string => !!x) } }, include: { cashbox: true } });
  const txById = new Map(payTx.map((t) => [t.id, t]));
  const canPay = can(user, "cashOps");
  const canEdit = can(user, "users") || canPay;

  // события выбранного периода
  const evs: Ev[] = [];
  if (sel) {
    if (sel.s.salary) evs.push({ key: "salary", type: "Оклад", group: "SALARY", date: sel.p.from, amount: sel.s.salary });
    sel.s.rows.forEach((r: SalaryRow, i) => evs.push({ key: `r${i}`, type: r.kind === "SALE" ? "За продажу" : "За выполненную работу", group: r.kind ?? "WORK", date: r.date, number: r.number, href: r.href, client: r.client, items: r.items, formula: r.formula, amount: r.amount }));
    sel.s.entries.forEach((e) => evs.push({ key: e.id, type: KIND[e.kind], group: e.kind, date: e.date, amount: e.kind === "BONUS" ? e.amount : -e.amount, entryId: e.id, paid: !!e.cashTxId, comment: e.comment }));
    evs.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
  const groups = [
    { k: "SALARY", label: "Оклад" },
    { k: "SALE", label: "Продажи" },
    { k: "WORK", label: "Выполненные работы" },
    { k: "BONUS", label: "Бонусы" },
    { k: "FINE", label: "Штрафы" },
    { k: "PAYOUT", label: "Выплаты" },
  ];
  const evShown = sp.ev ? evs.filter((e) => e.group === sp.ev) : evs;

  // форма создания
  const addKind = sp.add && ["BONUS", "FINE", "PAYOUT"].includes(sp.add) ? sp.add : null;
  const addPeriod = sheets.find((x) => x.p.key === sp.ap) ?? sheets[0];
  const now = new Date();
  const addDate = addPeriod && !(now >= addPeriod.p.from && now < addPeriod.p.to) ? new Date(addPeriod.p.to.getTime() - 864e5) : now;

  const tabLink = (k: string, label: string) => (
    <Link href={q({ tab: k, add: undefined })} className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-slate-900 text-white" : "text-blue-600 hover:bg-slate-100"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/cash/salary" className="text-sm text-slate-500 hover:text-slate-800">
          ← Зарплата
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{emp.name}</h1>
        {canEdit && (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg px-3 py-1.5 text-sm text-blue-600 hover:bg-slate-100">Создать ▾</summary>
            <div className="absolute z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {(["BONUS", "FINE", "PAYOUT"] as const).map((k) => (
                <Link key={k} href={q({ add: k, ap: sel?.p.key })} className="block px-3 py-1.5 text-sm hover:bg-slate-100">
                  {k === "PAYOUT" ? "Выплату" : KIND[k]}
                </Link>
              ))}
            </div>
          </details>
        )}
        <span className="h-6 w-px bg-slate-200" />
        {tabLink("acc", "Начисления")}
        {tabLink("pay", "Выплаты")}
        {tabLink("events", "События")}
        {can(user, "users") && (
          <Link href={`/settings/users/${id}`} className="rounded-lg px-3 py-1.5 text-sm text-blue-600 hover:bg-slate-100">
            Настройки
          </Link>
        )}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          {tab === "events" && (
            <Select name="p" defaultValue={sel?.p.key} className="w-48">
              {periods.map((p) => (
                <option key={p.key} value={p.key}>
                  За {p.label}
                </option>
              ))}
            </Select>
          )}
          {locations.length > 1 && (
            <Select name="loc" defaultValue={sp.loc ?? ""} className="w-44">
              <option value="">Все локации</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
          {(tab === "events" || locations.length > 1) && <button className={btn("secondary")}>Показать</button>}
        </form>
      </div>

      {tab === "acc" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  {["Период", "Оклад", "Начисления", "Бонусы", "Штрафы", "Итого", "Выплачено", "К выплате"].map((h, i) => (
                    <th key={h} className={`px-3 py-3 font-medium ${i ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sheets.map(({ p, s }) => (
                  <tr key={p.key} className="group hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Link href={q({ tab: "events", p: p.key })} className="hover:text-blue-600">
                          {p.label}
                        </Link>
                        <a href={`/print/t?salary=${id}&from=${ymd(p.from)}&to=${ymd(new Date(p.to.getTime() - 864e5))}`} target="_blank" title="Печать: расчётный лист, РКО, ведомость" className="rounded p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-blue-600">
                          <Printer size={15} />
                        </a>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{n2(s.salary)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={q({ tab: "events", p: p.key })} className="hover:text-blue-600">
                        {n2(s.accrued)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        {canEdit && (
                          <Link href={q({ add: "BONUS", ap: p.key })} title="Добавить бонус" className="rounded border border-emerald-200 p-1 text-emerald-600 opacity-0 group-hover:opacity-100 hover:bg-emerald-50">
                            <ThumbsUp size={14} />
                          </Link>
                        )}
                        <span className={s.bonus ? "text-emerald-700" : ""}>{n2(s.bonus)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        {canEdit && (
                          <Link href={q({ add: "FINE", ap: p.key })} title="Добавить штраф" className="rounded border border-red-200 p-1 text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-50">
                            <ThumbsDown size={14} />
                          </Link>
                        )}
                        <span className={s.fine ? "text-red-600" : ""}>{s.fine ? `−${n2(s.fine)}` : n2(0)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{n2(s.total)}</td>
                    <td className="px-3 py-2 text-right">{n2(s.paid)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        {canPay && s.due > 0 && (
                          <Link href={q({ add: "PAYOUT", ap: p.key })} title="Выплатить" className="rounded border border-blue-200 p-1 text-blue-600 opacity-0 group-hover:opacity-100 hover:bg-blue-50">
                            <Wallet size={14} />
                          </Link>
                        )}
                        <b className={s.due > 0 ? "text-amber-700" : s.due < 0 ? "text-red-600" : "text-slate-500"}>{n2(s.due)}</b>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  <td className="px-3 py-3">Итого</td>
                  <td className="px-3 py-3 text-right">{n2(sum("salary"))}</td>
                  <td className="px-3 py-3 text-right">{n2(sum("accrued"))}</td>
                  <td className="px-3 py-3 text-right">{n2(sum("bonus"))}</td>
                  <td className="px-3 py-3 text-right">{n2(-sum("fine"))}</td>
                  <td className="px-3 py-3 text-right">{n2(sum("total"))}</td>
                  <td className="px-3 py-3 text-right">{n2(sum("paid"))}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="inline-flex items-center gap-2">
                      {canPay && sum("due") > 0 && (
                        <Link href={q({ add: "PAYOUT", ap: sheets[0]?.p.key, all: "1" } as Partial<SP>)} title="Выплатить весь долг" className="rounded border border-blue-200 p-1 text-blue-600 hover:bg-blue-50">
                          <Wallet size={14} />
                        </Link>
                      )}
                      {n2(sum("due"))}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {tab === "pay" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <tr>
                {["Дата события", "Дата выдачи", "Касса", "Способ", "Примечание", "Сумма", ""].map((h) => (
                  <th key={h} className={`px-3 py-3 font-medium ${h === "Сумма" ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.map((e) => {
                const t = e.cashTxId ? txById.get(e.cashTxId) : null;
                return (
                  <tr key={e.id}>
                    <td className="px-3 py-2">{e.date.toLocaleDateString("ru-RU")}</td>
                    <td className="px-3 py-2">
                      {t ? (
                        <Link href={`/cash/operations/${t.id}`} className="text-blue-600 hover:underline">
                          {t.createdAt.toLocaleDateString("ru-RU")}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">{t?.cashbox.name ?? "не из кассы"}</td>
                    <td className="px-3 py-2 text-slate-500">{t ? ({ CASH: "Наличными", CARD: "Картой", TRANSFER: "Безналом" } as const)[t.method] : ""}</td>
                    <td className="px-3 py-2 text-slate-500">{e.comment}</td>
                    <td className="px-3 py-2 text-right font-medium text-red-600">−{n2(e.amount)}</td>
                    <td className="px-3 py-2 text-right">
                      {!e.cashTxId && can(user, "users") && (
                        <Form action={deleteSalaryEntryAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button className="text-xs text-red-600 hover:underline">удалить</button>
                        </Form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!payouts.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    Выплат пока не было
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td colSpan={5} className="px-3 py-3">
                  Итого выплачено
                </td>
                <td className="px-3 py-3 text-right">{n2(payouts.reduce((a, e) => a + e.amount, 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === "events" && sel && (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="h-fit rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 font-medium text-slate-700">Тип событий</div>
            <Link href={q({ ev: undefined })} className={`flex justify-between rounded px-2 py-1 ${!sp.ev ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
              <span>Показать все</span>
              <span>{rub(evs.reduce((a, e) => a + (e.group === "PAYOUT" ? 0 : e.amount), 0))}</span>
            </Link>
            {groups.map((g) => {
              const t = evs.filter((e) => e.group === g.k).reduce((a, e) => a + e.amount, 0);
              return (
                <Link key={g.k} href={q({ ev: g.k })} className={`flex justify-between rounded px-2 py-1 ${sp.ev === g.k ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                  <span>{g.label}</span>
                  <span className={t < 0 ? "text-red-600" : ""}>{rub(t)}</span>
                </Link>
              );
            })}
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <tr>
                    {["Тип события", "Дата и время", "Номер", "Контрагент", "Детально", "Сумма"].map((h) => (
                      <th key={h} className={`px-3 py-3 font-medium ${h === "Сумма" ? "text-right" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evShown.map((e) => (
                    <tr key={e.key} className="align-top">
                      <td className="px-3 py-2">
                        <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${e.amount < 0 ? "bg-red-500" : "bg-blue-500"}`} />
                        {e.type}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{e.date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="px-3 py-2">
                        {e.href ? (
                          <Link href={e.href} className="border-b border-dashed border-blue-400 text-blue-600">
                            {e.number}
                          </Link>
                        ) : null}
                      </td>
                      <td className="max-w-40 truncate px-3 py-2 text-slate-600">{e.client}</td>
                      <td className="px-3 py-2">
                        {e.items?.length ? (
                          <div className="flex gap-3">
                            <div className="min-w-0 flex-1 border-r border-slate-200 pr-3">
                              {e.items.map((it, i) => (
                                <div key={i} className="flex justify-between gap-3">
                                  <span>{it.name}</span>
                                  <span className="shrink-0 text-slate-500">{it.qty} шт.</span>
                                </div>
                              ))}
                            </div>
                            <div className="shrink-0 text-slate-500">
                              ({e.formula}) = <b className="text-slate-800">{n2(e.amount)} руб</b>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">
                            {e.comment}
                            {e.paid && <span className="ml-2 text-xs text-slate-400">из кассы</span>}
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${e.amount < 0 ? "text-red-600" : ""}`}>
                        {n2(e.amount)}
                        {e.entryId && !e.paid && can(user, "users") && (
                          <Form action={deleteSalaryEntryAction}>
                            <input type="hidden" name="id" value={e.entryId} />
                            <button className="text-xs font-normal text-red-600 hover:underline">удалить</button>
                          </Form>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!evShown.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                        За {sel.p.label} событий нет
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold">
                  <tr>
                    <td colSpan={5} className="px-3 py-3">
                      Итого
                    </td>
                    <td className="px-3 py-3 text-right">{n2(evShown.reduce((a, e) => a + e.amount, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Окно: бонус, штраф или выплата */}
      {addKind && addPeriod && canEdit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <Link href={q({ add: undefined, ap: undefined })} className="absolute top-3 right-3 rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Закрыть">
              <X size={18} />
            </Link>
            <Form action={addSalaryEntryAction} resetOnOk={false} className="grid md:grid-cols-2">
              <input type="hidden" name="userId" value={id} />
              <input type="hidden" name="kind" value={addKind} />
              <div className="space-y-3 p-6">
                <div className="text-xs text-slate-500">{emp.name}</div>
                <div className="text-xl font-semibold">{addKind === "PAYOUT" ? "Выплата зарплаты" : addKind === "BONUS" ? "Бонус" : "Штраф"}</div>
                <div className="text-xs text-slate-500">
                  Период: {addPeriod.p.label} · к выплате {rub(addPeriod.s.due)}
                </div>
                <Field label="Дата события" hint="К какому периоду относится">
                  <Input type="date" name="date" defaultValue={ymd(addDate)} />
                </Field>
                <Field label="Сумма, ₽">
                  <Input name="amount" inputMode="decimal" required autoFocus defaultValue={addKind === "PAYOUT" ? String(Math.max(0, (sp as Record<string, string>).all ? sum("due") : addPeriod.s.due) / 100) : ""} />
                </Field>
                <Field label={addKind === "PAYOUT" ? "Примечание" : "За что"}>
                  <Textarea name="comment" rows={3} />
                </Field>
              </div>
              <div className="space-y-3 bg-slate-50 p-6">
                {addKind === "PAYOUT" ? (
                  canPay ? (
                    <>
                      <input type="hidden" name="fromCash" value="1" />
                      <Field label="Дата выдачи">
                        <Select name="issueMode" defaultValue="now">
                          <option value="now">Сегодня, сейчас</option>
                          <option value="event">Датой события</option>
                        </Select>
                      </Field>
                      {locations.length > 1 && (
                        <Field label="Локация">
                          <Select name="locationId" defaultValue={location?.id ?? ""}>
                            {locations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      )}
                      <Field label="Касса">
                        <Select name="cashboxId" defaultValue={places.cashboxes[0]?.id}>
                          {places.cashboxes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Тип выплаты">
                        <Select name="method" defaultValue="CASH">
                          <option value="CASH">Наличными</option>
                          <option value="CARD">Картой</option>
                          <option value="TRANSFER">Безналом</option>
                        </Select>
                      </Field>
                    </>
                  ) : (
                    <>
                      <input type="hidden" name="fromCash" value="0" />
                      <p className="text-sm text-slate-500">Выплата запишется без расхода из кассы: у вас нет права на кассовые операции.</p>
                    </>
                  )
                ) : (
                  <p className="text-sm text-slate-500">{addKind === "BONUS" ? "Бонус прибавится к начислениям за период." : "Штраф вычтется из начислений за период."}</p>
                )}
                <Submit className="w-full">{addKind === "PAYOUT" ? "Выплатить зарплату" : addKind === "BONUS" ? "Добавить бонус" : "Добавить штраф"}</Submit>
                {addKind === "PAYOUT" && (
                  <a href={`/print/t?salary=${id}&from=${ymd(addPeriod.p.from)}&to=${ymd(new Date(addPeriod.p.to.getTime() - 864e5))}`} target="_blank" className="block text-center text-sm text-blue-600 hover:underline">
                    Печать: расходный ордер, ведомость
                  </a>
                )}
                <Link href={q({ add: undefined, ap: undefined })} className="block text-center text-sm text-slate-500 hover:underline">
                  Закрыть
                </Link>
              </div>
            </Form>
          </div>
        </div>
      )}
    </>
  );
}
