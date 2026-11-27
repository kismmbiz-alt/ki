import Link from "next/link";
import { ArrowDown, ArrowLeftRight, ArrowUp, Pencil, X } from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { btn, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { Form } from "@/components/form";
import { rub } from "@/lib/money";
import { cashboxBalances, cashCategories } from "@/lib/domain/cash";
import { placesFor } from "@/lib/domain/places";
import { cashAction, transferAction } from "./actions";
import { OpsTable } from "./_ops-table";
import { CashTabs } from "./_tabs";

const num = (k: number) => (k / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " руб";

/** Кассы как в LiveSklad: карточка на каждую кассу, наличные / на счёте / всего, кнопки Выдача, Внесение, Перевод. */
export default async function CashPage({ searchParams }: { searchParams: Promise<{ op?: string; c?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("cash");
  const { db, location, user } = ctx;
  const t = { db, companyId: ctx.company.id };
  const { cashboxes } = await placesFor(t, user.locationId ? location?.id : null, user);
  const balances = await cashboxBalances(t, cashboxes.map((c) => c.id));
  const today = new Date(new Date().toDateString());
  const [list, locs, staff, categories] = await Promise.all([
    db.cashTransaction.findMany({
      where: { cashboxId: { in: cashboxes.map((c) => c.id) }, createdAt: { gte: today }, deletedAt: null },
      include: { user: true, cashbox: true, order: { select: { id: true, number: true } }, sale: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.location.findMany({ select: { id: true, name: true } }),
    db.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    cashCategories(t),
  ]);
  const locName = new Map(locs.map((l) => [l.id, l.name]));
  const total = cashboxes.reduce((s, c) => s + (balances.get(c.id)?.total ?? 0), 0);
  const income = list.filter((x) => x.amount > 0 && !x.transferId).reduce((s, x) => s + x.amount, 0);
  const expense = list.filter((x) => x.amount < 0 && !x.transferId).reduce((s, x) => s - x.amount, 0);
  const canOps = can(user, "cashOps");
  const canTransfer = can(user, "cashTransfer") && cashboxes.length > 1;
  const box = cashboxes.find((c) => c.id === sp.c);
  const op = box && ((sp.op === "out" || sp.op === "in") && canOps ? sp.op : sp.op === "move" && canTransfer ? "move" : null);
  const bal = box ? balances.get(box.id)! : null;

  return (
    <>
      <PageHeader title="Кассы">
        {can(user, "settings") && (
          <Link href="/settings/places" className="text-sm text-blue-600 hover:underline">
            Добавить или настроить кассы
          </Link>
        )}
      </PageHeader>
      <CashTabs />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cashboxes.map((c) => {
          const b = balances.get(c.id)!;
          const account = b.CARD + b.TRANSFER;
          return (
            <div key={c.id} className={`rounded-xl border bg-white p-5 shadow-sm ${c.id === sp.c ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/cash/operations?c=${c.id}`} className="block truncate text-lg font-semibold text-slate-900 hover:text-blue-600">
                    {c.name}
                  </Link>
                  <div className="text-xs text-slate-400">{c.locationId ? locName.get(c.locationId) : "все точки"}</div>
                </div>
                {can(user, "settings") && (
                  <Link href="/settings/places" className="rounded p-1 text-slate-400 hover:text-slate-700" title="Настроить кассу">
                    <Pencil size={15} />
                  </Link>
                )}
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Наличными в кассе:</dt>
                  <dd className={`font-medium ${b.CASH < 0 ? "text-red-600" : "text-slate-900"}`}>{num(b.CASH)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">На счёте:</dt>
                  <dd className={`font-medium ${account < 0 ? "text-red-600" : "text-slate-900"}`}>{num(account)}</dd>
                </div>
                <div className="flex justify-between border-t border-dashed border-slate-200 pt-1.5 text-slate-500">
                  <dt>Всего денег:</dt>
                  <dd className={b.total < 0 ? "text-red-600" : ""}>{num(b.total)}</dd>
                </div>
              </dl>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {canOps && (
                  <>
                    <Link href={`/cash?op=out&c=${c.id}`} scroll={false} className="inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 px-2 py-2 text-sm font-medium text-white hover:bg-red-700">
                      <ArrowUp size={15} /> Выдача
                    </Link>
                    <Link href={`/cash?op=in&c=${c.id}`} scroll={false} className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                      <ArrowDown size={15} /> Внесение
                    </Link>
                  </>
                )}
                {canTransfer && (
                  <Link href={`/cash?op=move&c=${c.id}`} scroll={false} className="inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    <ArrowLeftRight size={15} /> Перевод
                  </Link>
                )}
              </div>
            </div>
          );
        })}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-lg font-semibold text-slate-800">Всего в кассах</div>
          <div className={`mt-3 text-2xl font-semibold ${total < 0 ? "text-red-600" : "text-slate-900"}`}>{rub(total)}</div>
          <div className="mt-2 text-sm">
            Сегодня: <span className="text-emerald-600">+{rub(income)}</span> / <span className="text-red-600">−{rub(expense)}</span>
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Операции за сегодня</h2>
        <Link href="/cash/operations" className="text-sm text-blue-600 hover:underline">
          Все транзакции и фильтры
        </Link>
      </div>
      <OpsTable list={list} />

      {/* Боковая панель операции, как в LiveSklad */}
      {op && box && bal && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40">
          <Link href="/cash" scroll={false} className="flex-1" aria-label="Закрыть" />
          <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <Link href="/cash" scroll={false} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Закрыть">
                <X size={18} />
              </Link>
              <h2 className={`text-xl font-semibold ${op === "out" ? "text-red-600" : op === "in" ? "text-emerald-600" : "text-blue-600"}`}>{op === "out" ? "Выдача" : op === "in" ? "Внесение" : "Перевод"}</h2>
            </div>
            <div className="space-y-1 border-b border-slate-100 px-5 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Денег наличными:</span>
                <span>{num(bal.CASH)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Денег на счёте:</span>
                <span>{num(bal.CARD + bal.TRANSFER)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Всего денег:</span>
                <span>{num(bal.total)}</span>
              </div>
            </div>
            {op === "move" ? (
              <Form action={transferAction} className="space-y-3 p-5">
                <input type="hidden" name="fromCashboxId" value={box.id} />
                <Field label="Из кассы">
                  <Input value={box.name} disabled readOnly />
                </Field>
                <Field label="В кассу">
                  <Select name="toCashboxId" defaultValue={cashboxes.find((c) => c.id !== box.id)?.id}>
                    {cashboxes
                      .filter((c) => c.id !== box.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Сумма, ₽">
                  <Input name="amount" required inputMode="decimal" autoFocus />
                </Field>
                <Field label="Примечание">
                  <Textarea name="comment" rows={2} placeholder="Например: инкассация, по приказу" />
                </Field>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button name="method" value="CASH" className={btn("secondary")}>
                    Наличными
                  </button>
                  <button name="method" value="CARD" className={btn("secondary")}>
                    Со счёта
                  </button>
                </div>
              </Form>
            ) : (
              <Form action={cashAction} className="space-y-3 p-5">
                <input type="hidden" name="type" value={op === "out" ? "expense" : "income"} />
                <input type="hidden" name="cashboxId" value={box.id} />
                <Field label="Касса">
                  <Input value={box.name} disabled readOnly />
                </Field>
                <Field label="Тип операции">
                  <Input name="category" list="cash-cats" required placeholder="Выберите или впишите статью" />
                  <datalist id="cash-cats">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                {op === "out" && (
                  <Field label="Получатель">
                    <Select name="recipientId" defaultValue="">
                      <option value="">Выберите получателя</option>
                      {staff.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Сумма, ₽">
                  <Input name="amount" required inputMode="decimal" autoFocus />
                </Field>
                <Field label="Примечание">
                  <Textarea name="comment" rows={3} />
                </Field>
                <p className="pt-1 text-xs text-slate-500">Чем {op === "out" ? "выдаём" : "вносим"}:</p>
                <div className="grid gap-2">
                  <button name="method" value="CASH" className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left font-medium hover:border-blue-400 hover:bg-blue-50">
                    <span className="text-2xl">💵</span> Наличными
                  </button>
                  <button name="method" value="CARD" className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left font-medium hover:border-blue-400 hover:bg-blue-50">
                    <span className="text-2xl">💳</span> Картой
                  </button>
                  <button name="method" value="TRANSFER" className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left font-medium hover:border-blue-400 hover:bg-blue-50">
                    <span className="text-2xl">🏦</span> Безналом (на счёт)
                  </button>
                </div>
              </Form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
