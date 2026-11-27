import Link from "next/link";
import type { StockDocType } from "@prisma/client";
import { Plus } from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { btn, dt, Input, PageHeader, Select, Table } from "@/components/ui";
import { findDocs, type DocFilter } from "@/lib/domain/stock-docs";
import { RowLink } from "@/components/row-link";
import { rub } from "@/lib/money";
import { DOC_LABEL } from "@/lib/domain/stock";
import { StockTabs } from "./tabs";

/** Список складских документов одного вида для текущей точки. */
export async function DocList({
  types,
  action,
  actionLabel,
  title = "Склад",
  filter = {},
  children,
}: {
  types: StockDocType[];
  action?: StockDocType;
  actionLabel?: string;
  title?: string;
  filter?: DocFilter;
  children?: React.ReactNode;
}) {
  const { db, location, user } = await requirePermission("stock");
  const docs = types.length ? await findDocs(db, types, location?.id, filter) : [];
  const [userList, warehouses] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true } }),
    db.warehouse.findMany({ where: { isActive: true, ...(location ? { locationId: location.id } : {}) }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
  ]);
  const users = new Map(userList.map((u) => [u.id, u.name]));
  const showCost = can(user, "cost");
  const isReceipt = types.length === 1 && types[0] === "RECEIPT";
  const sum = docs.reduce((a, d) => a + Math.abs(d.total), 0);
  const qs = new URLSearchParams({ types: types.join(","), ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) }).toString();
  return (
    <>
      <PageHeader title={title}>
        {action && can(user, "stockDocs") && (
          <Link href={`/stock/docs/new?type=${action}`} className={btn()}>
            <Plus size={16} /> {actionLabel ?? DOC_LABEL[action]}
          </Link>
        )}
      </PageHeader>
      <StockTabs />
      {children}
      {types.length > 0 && (
      <>
      <form className="mb-3 flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={filter.q ?? ""} placeholder="Поиск: №, поставщик, товар, накладная" className="w-72" />
        {warehouses.length > 1 && (
          <Select name="wh" defaultValue={filter.wh ?? ""} className="w-44">
            <option value="">Все склады</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        )}
        <label className="text-xs text-slate-500">
          с <Input type="date" name="from" defaultValue={filter.from ?? ""} className="w-40" />
        </label>
        <label className="text-xs text-slate-500">
          по <Input type="date" name="to" defaultValue={filter.to ?? ""} className="w-40" />
        </label>
        <button className={btn("secondary")}>Показать</button>
        {(filter.q || filter.from || filter.to || filter.wh) && (
          <Link href="?" className="px-2 py-2 text-sm text-slate-500 hover:text-slate-800">
            Сбросить
          </Link>
        )}
        <a href={`/stock/docs/export?${qs}`} className={`${btn("secondary")} ml-auto`}>
          Экспорт
        </a>
      </form>
      <Table head={["№", "Дата", "Документ", "Склад", isReceipt ? "От кого" : "Поставщик / куда", "Позиций", ...(showCost ? ["Сумма по закупке"] : []), ...(isReceipt && showCost ? ["Оплачено"] : []), "Кто"]} empty="Документов не найдено">
        {docs.map((d) => (
          <RowLink key={d.id} href={`/stock/docs/${d.id}`}>
            <td className="px-3 py-2 font-medium">{d.number}</td>
            <td className="px-3 py-2 whitespace-nowrap text-slate-500">{dt(d.createdAt)}</td>
            <td className="px-3 py-2">{DOC_LABEL[d.type]}</td>
            <td className="px-3 py-2">{d.warehouse.name}</td>
            <td className="px-3 py-2 text-slate-600">
              {d.supplier ? (
                <Link href={`/stock/suppliers/${d.supplier.id}`} className="text-blue-600 hover:underline">
                  {d.supplier.name}
                </Link>
              ) : d.client ? (
                <Link href={`/clients/${d.client.id}`} className="text-blue-600 hover:underline">
                  Клиент: {d.client.name}
                </Link>
              ) : (d.toWarehouse ? `→ ${d.toWarehouse.name}${d.toWarehouse.locationId !== d.locationId ? ` (${d.toWarehouse.location.name})` : ""}` : d.comment)}
            </td>
            <td className="px-3 py-2">{d._count.items}</td>
            {showCost && (
              <td className="px-3 py-2 whitespace-nowrap">
                {rub(d.total)}
              </td>
            )}
            {isReceipt && showCost && (
              <td className="px-3 py-2 whitespace-nowrap">
                {rub(d.paid)}
                {d.total > d.paid && <div className="text-xs text-red-600">долг {rub(d.total - d.paid)}</div>}
              </td>
            )}
            <td className="px-3 py-2 text-slate-500">{d.userId ? users.get(d.userId) : ""}</td>
          </RowLink>
        ))}
      </Table>
      <p className="mt-2 text-sm text-slate-500">
        Всего документов – {docs.length}
        {showCost && <>, на сумму {rub(sum)}</>}
        {docs.length === 500 && " (показаны последние 500, уточните период)"}
      </p>
      </>
      )}
    </>
  );
}
