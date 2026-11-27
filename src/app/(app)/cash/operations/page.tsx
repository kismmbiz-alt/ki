import Link from "next/link";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { btn, Input, PageHeader, Select } from "@/components/ui";
import { RowLink } from "@/components/row-link";
import { PeriodPicker } from "@/components/period-picker";
import { periodLabel } from "@/lib/period-presets";
import { rub } from "@/lib/money";
import { placesFor } from "@/lib/domain/places";
import { findTxs, type TxFilter } from "@/lib/domain/cash-list";
import { CashTabs } from "../_tabs";

const PAY = { CASH: "Наличными", CARD: "Картой", TRANSFER: "Безналом" } as const;
const num = (k: number) => (k / 100).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function Total({ label, inc, out }: { label: string; inc: number; out: number }) {
  const net = inc + out;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <div className="text-right text-sm leading-tight">
        <div className="text-emerald-600">{num(inc)}</div>
        <div className="text-red-600">− {num(Math.abs(out))}</div>
      </div>
      <div className={`rounded-md border-l-4 px-3 py-1.5 font-semibold ${net < 0 ? "border-red-500 bg-red-50 text-red-700" : "border-emerald-500 bg-emerald-50 text-emerald-700"}`}>{num(net)}</div>
    </div>
  );
}

/** Транзакции как в LiveSklad: все движения денег по кассам с фильтрами и итогами. */
export default async function OperationsPage({ searchParams }: { searchParams: Promise<TxFilter> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("cash");
  const { db, user, location } = ctx;
  const { cashboxes } = await placesFor({ db, companyId: ctx.company.id }, user.locationId ? location?.id : null, user);
  const [{ rows, count, totals }, users, suppliers] = await Promise.all([
    findTxs(db, cashboxes.map((c) => c.id), sp),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const back = qs ? `?${qs}` : "";

  return (
    <>
      <PageHeader title="Транзакции">
        <a href={`/cash/operations/export${back}`} className={btn("secondary")}>
          <Download size={16} /> Экспорт
        </a>
      </PageHeader>
      <CashTabs />
      <form className="mb-3 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Поиск: статья, примечание, номер" className="w-56" />
        <Select name="st" defaultValue={sp.st ?? ""} className="w-36">
          <option value="">Активные</option>
          <option value="edited">Изменённые</option>
          <option value="deleted">Удалённые</option>
        </Select>
        <Select name="k" defaultValue={sp.k ?? ""} className="w-36">
          <option value="">Приход и расход</option>
          <option value="in">Только приход</option>
          <option value="out">Только расход</option>
          <option value="transfer">Переводы</option>
        </Select>
        <Select name="c" defaultValue={sp.c ?? ""} className="w-40">
          <option value="">Касса</option>
          {cashboxes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="u" defaultValue={sp.u ?? ""} className="w-40">
          <option value="">Ответственный</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select name="r" defaultValue={sp.r ?? ""} className="w-40">
          <option value="">Получатель</option>
          <optgroup label="Сотрудники">
            {users.map((u) => (
              <option key={u.id} value={`u:${u.id}`}>
                {u.name}
              </option>
            ))}
          </optgroup>
          {suppliers.length > 0 && (
            <optgroup label="Поставщики">
              {suppliers.map((s) => (
                <option key={s.id} value={`s:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <PeriodPicker from={sp.from} to={sp.to} />
        <button className={btn("secondary")}>Показать</button>
        {qs && (
          <Link href="/cash/operations" className="px-1 text-sm text-slate-500 hover:text-slate-800">
            Сбросить
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                {["Документ", "Дата", "Сумма", "Оплата", "Статья", "Касса", "Остаток", "Сотрудник", "Получатель", "Примечание"].map((h) => (
                  <th key={h} className={`px-3 py-2.5 font-medium ${h === "Сумма" || h === "Остаток" ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((x) => {
                const inc = x.shown > 0;
                return (
                  <RowLink key={x.id} href={`/cash/operations/${x.id}${back}`} className={x.deletedAt ? "opacity-60" : ""}>
                    <td className="px-3 py-2">
                      {x.doc ? (
                        <Link href={x.doc.href} className="border-b border-dashed border-blue-400 text-blue-600">
                          {x.doc.label}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                      {x.createdAt.toLocaleDateString("ru-RU")} · {x.createdAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      {x.editedAt && <div className="text-xs text-amber-600">изменена</div>}
                      {x.deletedAt && <div className="text-xs text-red-600">удалена</div>}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${x.deletedAt ? "line-through" : ""} ${inc ? "text-emerald-600" : "text-red-600"}`}>
                      <span className="inline-flex items-center gap-1">
                        {inc ? "" : "−"}
                        {num(Math.abs(x.shown))}
                        {inc ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{PAY[x.method]}</td>
                    <td className="px-3 py-2">{x.category}</td>
                    <td className="px-3 py-2 text-slate-600">{x.cashbox.name}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${x.balance != null && x.balance < 0 ? "text-red-600" : "text-slate-700"}`}>{x.balance == null ? "" : num(x.balance)}</td>
                    <td className="px-3 py-2 text-slate-600">{x.user?.name}</td>
                    <td className="px-3 py-2">
                      {x.recipient?.href ? (
                        <Link href={x.recipient.href} className="border-b border-dashed border-blue-400 text-blue-600">
                          {x.recipient.label}
                        </Link>
                      ) : (
                        x.recipient?.label
                      )}
                    </td>
                    <td className="max-w-56 px-3 py-2 text-slate-500">
                      <span className="line-clamp-2">{x.comment}</span>
                    </td>
                  </RowLink>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                    Транзакций не найдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-sm leading-tight">
            <div className="text-slate-500">Найдено:</div>
            <b>{count}</b>
            {(sp.from || sp.to) && <div className="text-xs text-slate-400">{periodLabel(sp.from, sp.to)}</div>}
            {count > rows.length && <div className="text-xs text-slate-400">показаны последние {rows.length}</div>}
          </div>
          <Total label="Наличными:" inc={totals.cash.in} out={totals.cash.out} />
          <Total label="Картой:" inc={totals.card.in} out={totals.card.out} />
          <Total label="Итого:" inc={totals.cash.in + totals.card.in} out={totals.cash.out + totals.card.out} />
        </div>
      </div>
    </>
  );
}
