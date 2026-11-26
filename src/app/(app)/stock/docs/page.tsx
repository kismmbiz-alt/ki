import Link from "next/link";
import { ArrowLeftRight, ClipboardCheck, PackageMinus, PackagePlus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { btn, dt, PageHeader, Table } from "@/components/ui";
import { RowLink } from "@/components/row-link";
import { rub } from "@/lib/money";
import { DOC_LABEL } from "@/lib/domain/stock";
import { StockTabs } from "../_ui/tabs";

export default async function DocsPage() {
  const { db, location } = await requirePermission("stock");
  const docs = await db.stockDoc.findMany({
    where: location ? { OR: [{ locationId: location.id }, { toLocationId: location.id }] } : {},
    include: { location: true, toLocation: true, supplier: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return (
    <>
      <PageHeader title="Склад">
        <Link href="/stock/docs/new?type=RECEIPT" className={btn()}>
          <PackagePlus size={16} /> Оприходовать
        </Link>
        <Link href="/stock/docs/new?type=TRANSFER" className={btn("secondary")}>
          <ArrowLeftRight size={16} /> Переместить
        </Link>
        <Link href="/stock/docs/new?type=WRITEOFF" className={btn("secondary")}>
          <PackageMinus size={16} /> Списать
        </Link>
        <Link href="/stock/docs/new?type=INVENTORY" className={btn("secondary")}>
          <ClipboardCheck size={16} /> Инвентаризация
        </Link>
      </PageHeader>
      <StockTabs />
      <Table head={["№", "Дата", "Документ", "Точка", "Поставщик / куда", "Позиций", "Сумма по закупке"]} empty="Документов пока нет">
        {docs.map((d) => (
          <RowLink key={d.id} href={`/stock/docs/${d.id}`}>
            <td className="px-3 py-2 font-medium">{d.number}</td>
            <td className="px-3 py-2 whitespace-nowrap text-slate-500">{dt(d.createdAt)}</td>
            <td className="px-3 py-2">{DOC_LABEL[d.type]}</td>
            <td className="px-3 py-2">{d.location.name}</td>
            <td className="px-3 py-2 text-slate-600">{d.supplier?.name ?? (d.toLocation ? `→ ${d.toLocation.name}` : d.comment)}</td>
            <td className="px-3 py-2">{d._count.items}</td>
            <td className="px-3 py-2">{rub(d.total)}</td>
          </RowLink>
        ))}
      </Table>
    </>
  );
}
