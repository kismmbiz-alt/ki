import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { btn, Input, PageHeader, Select, Stat } from "@/components/ui";
import { rub } from "@/lib/money";
import { parseRange } from "@/lib/period";
import { placesFor } from "@/lib/domain/places";
import { CashTabs } from "../_tabs";
import { OpsTable } from "../_ops-table";

type SP = { from?: string; to?: string; c?: string; u?: string; k?: string; q?: string };

/** Полный список операций по кассам с фильтрами. */
export default async function OperationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("cash");
  const { db, user, location } = ctx;
  const { fromS, toS, from, to } = parseRange(sp);
  const { cashboxes } = await placesFor({ db, companyId: ctx.company.id }, user.locationId ? location?.id : null);
  const ids = cashboxes.map((c) => c.id);
  const where: Prisma.CashTransactionWhereInput = { createdAt: { gte: from, lt: to }, cashboxId: sp.c && ids.includes(sp.c) ? sp.c : { in: ids } };
  if (sp.u) where.userId = sp.u;
  if (sp.k === "in") Object.assign(where, { amount: { gt: 0 }, transferId: null });
  if (sp.k === "out") Object.assign(where, { amount: { lt: 0 }, transferId: null });
  if (sp.k === "transfer") where.transferId = { not: null };
  if (sp.k === "orders") where.orderId = { not: null };
  if (sp.k === "sales") where.saleId = { not: null };
  const q = sp.q?.trim();
  if (q) where.OR = [{ category: { contains: q, mode: "insensitive" } }, { comment: { contains: q, mode: "insensitive" } }];
  const [list, users] = await Promise.all([
    db.cashTransaction.findMany({
      where,
      include: { user: true, cashbox: true, order: { select: { id: true, number: true } }, sale: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const income = list.filter((x) => x.amount > 0 && !x.transferId).reduce((s, x) => s + x.amount, 0);
  const expense = list.filter((x) => x.amount < 0 && !x.transferId).reduce((s, x) => s - x.amount, 0);

  return (
    <>
      <PageHeader title="Финансы" />
      <CashTabs />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Input type="date" name="from" defaultValue={fromS} className="w-40" />
        <Input type="date" name="to" defaultValue={toS} className="w-40" />
        <Select name="c" defaultValue={sp.c ?? ""} className="w-44">
          <option value="">Все кассы</option>
          {cashboxes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="k" defaultValue={sp.k ?? ""} className="w-44">
          <option value="">Все операции</option>
          <option value="in">Приходы</option>
          <option value="out">Расходы</option>
          <option value="transfer">Переводы между кассами</option>
          <option value="orders">Оплаты заказов</option>
          <option value="sales">Продажи и возвраты</option>
        </Select>
        <Select name="u" defaultValue={sp.u ?? ""} className="w-44">
          <option value="">Все сотрудники</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Input name="q" defaultValue={q} placeholder="Статья или комментарий" className="w-52" />
        <button className={btn("secondary")}>Показать</button>
      </form>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Приход" value={rub(income)} />
        <Stat label="Расход" value={rub(expense)} />
        <Stat label="Итого" value={rub(income - expense)} />
        <Stat label="Операций" value={list.length} sub={list.length === 1000 ? "показаны первые 1000" : undefined} />
      </div>
      <OpsTable list={list} empty="За выбранный период операций нет" />
    </>
  );
}
