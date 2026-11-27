import Link from "next/link";
import type { StockDocType } from "@prisma/client";
import { Plus } from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { btn, dt, PageHeader, Table } from "@/components/ui";
import { RowLink } from "@/components/row-link";
import { rub } from "@/lib/money";
import { DOC_LABEL } from "@/lib/domain/stock";
import { StockTabs } from "./tabs";

/** Список складских документов одного вида для текущей точки. */
export async function DocList({ types, action, actionLabel, children }: { types: StockDocType[]; action?: StockDocType; actionLabel?: string; children?: React.ReactNode }) {
  const { db, location, user } = await requirePermission("stock");
  const docs = await db.stockDoc.findMany({
    where: { type: { in: types }, ...(location ? { OR: [{ locationId: location.id }, { toLocationId: location.id }] } : {}) },
    include: { warehouse: true, toWarehouse: { include: { location: true } }, supplier: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const users = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const showCost = can(user, "cost");
  return (
    <>
      <PageHeader title="Склад">
        {action && can(user, "stockDocs") && (
          <Link href={`/stock/docs/new?type=${action}`} className={btn()}>
            <Plus size={16} /> {actionLabel ?? DOC_LABEL[action]}
          </Link>
        )}
      </PageHeader>
      <StockTabs />
      {children}
      <Table head={["№", "Дата", "Документ", "Склад", "Поставщик / куда", "Позиций", ...(showCost ? ["Сумма по закупке"] : []), "Кто"]} empty="Документов пока нет">
        {docs.map((d) => (
          <RowLink key={d.id} href={`/stock/docs/${d.id}`}>
            <td className="px-3 py-2 font-medium">{d.number}</td>
            <td className="px-3 py-2 whitespace-nowrap text-slate-500">{dt(d.createdAt)}</td>
            <td className="px-3 py-2">{DOC_LABEL[d.type]}</td>
            <td className="px-3 py-2">{d.warehouse.name}</td>
            <td className="px-3 py-2 text-slate-600">
              {d.supplier?.name ?? (d.toWarehouse ? `→ ${d.toWarehouse.name}${d.toWarehouse.locationId !== d.locationId ? ` (${d.toWarehouse.location.name})` : ""}` : d.comment)}
            </td>
            <td className="px-3 py-2">{d._count.items}</td>
            {showCost && <td className="px-3 py-2">{rub(d.total)}</td>}
            <td className="px-3 py-2 text-slate-500">{d.userId ? users.get(d.userId) : ""}</td>
          </RowLink>
        ))}
      </Table>
    </>
  );
}
