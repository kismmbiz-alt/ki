import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { btn, dt, Input, PageHeader, Select, Table } from "@/components/ui";
import { rub } from "@/lib/money";
import { parseRange } from "@/lib/period";
import { LOG_KIND_LABEL, type LogKind } from "@/lib/domain/log";
import { CashTabs } from "../_tabs";

type SP = { from?: string; to?: string; u?: string; k?: string; c?: string };

/** Журнал действий сотрудников: продажи, оплаты, касса, склад, настройки. */
export default async function JournalPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db, user, location } = await requirePermission("journal");
  const { fromS, toS, from, to } = parseRange(sp, "today");
  const where: Prisma.ActionLogWhereInput = { createdAt: { gte: from, lt: to } };
  if (user.locationId) where.OR = [{ locationId: location?.id }, { locationId: null }];
  if (sp.u) where.userId = sp.u;
  if (sp.k) where.kind = sp.k;
  if (sp.c) where.cashboxId = sp.c;
  const [list, users, cashboxes] = await Promise.all([
    db.actionLog.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.cashbox.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }),
  ]);
  const boxName = new Map(cashboxes.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Финансы" />
      <CashTabs />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Input type="date" name="from" defaultValue={fromS} className="w-40" />
        <Input type="date" name="to" defaultValue={toS} className="w-40" />
        <Select name="u" defaultValue={sp.u ?? ""} className="w-44">
          <option value="">Все сотрудники</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select name="k" defaultValue={sp.k ?? ""} className="w-40">
          <option value="">Все разделы</option>
          {(Object.keys(LOG_KIND_LABEL) as LogKind[]).map((k) => (
            <option key={k} value={k}>
              {LOG_KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <Select name="c" defaultValue={sp.c ?? ""} className="w-44">
          <option value="">Все кассы</option>
          {cashboxes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <button className={btn("secondary")}>Показать</button>
      </form>
      <Table head={["Время", "Сотрудник", "Раздел", "Что сделал", "Касса", "Сумма"]} empty="За выбранный период действий нет">
        {list.map((e) => (
          <tr key={e.id}>
            <td className="whitespace-nowrap px-3 py-2 text-slate-500">{dt(e.createdAt)}</td>
            <td className="px-3 py-2">{e.user?.name ?? "—"}</td>
            <td className="px-3 py-2 text-slate-500">{LOG_KIND_LABEL[e.kind as LogKind] ?? e.kind}</td>
            <td className="px-3 py-2">
              {e.link ? (
                <Link href={e.link} className="text-blue-600 hover:underline">
                  {e.text}
                </Link>
              ) : (
                e.text
              )}
            </td>
            <td className="px-3 py-2 text-slate-500">{e.cashboxId ? boxName.get(e.cashboxId) : ""}</td>
            <td className={`whitespace-nowrap px-3 py-2 ${e.amount != null && e.amount < 0 ? "text-red-600" : ""}`}>{e.amount != null ? rub(e.amount) : ""}</td>
          </tr>
        ))}
      </Table>
      {list.length === 1000 && <p className="mt-2 text-xs text-slate-500">Показаны последние 1000 действий. Сузьте период или выберите сотрудника.</p>}
    </>
  );
}
