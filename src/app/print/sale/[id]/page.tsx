import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { rub } from "@/lib/money";
import { dOnly, dt } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export default async function PrintSale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company } = await requirePermission("sales");
  const s = await db.sale.findUnique({ where: { id }, include: { items: true, location: true, user: true, client: true } });
  if (!s) notFound();
  const sum = s.items.reduce((a, i) => a + i.qty * i.price, 0);
  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <PrintButton />
      <div className="text-center">
        <div className="text-base font-bold">{company.name}</div>
        <div className="text-[12px]">{[s.location.address ?? company.address, s.location.phone ?? company.phone].filter(Boolean).join(" · ")}</div>
        <div className="mt-3 text-base font-bold">
          {s.isReturn ? "Возврат" : "Товарный чек"} № {s.number} от {dOnly(s.createdAt)}
        </div>
      </div>
      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1">№</th>
            <th className="py-1">Наименование</th>
            <th className="py-1 text-right">Кол-во</th>
            <th className="py-1 text-right">Цена</th>
            <th className="py-1 text-right">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((i, n) => (
            <tr key={i.id} className="border-b border-slate-300">
              <td className="py-1">{n + 1}</td>
              <td className="py-1">{i.name}</td>
              <td className="py-1 text-right">{i.qty}</td>
              <td className="py-1 text-right">{rub(i.price)}</td>
              <td className="py-1 text-right">{rub(i.qty * i.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-right">
        {s.discount > 0 && <div>Скидка: −{rub(s.discount)}</div>}
        <div>
          Итого: <b>{rub(s.isReturn ? -s.total : sum - s.discount)}</b>
        </div>
      </div>
      {s.client && <p className="mt-3">Покупатель: {s.client.name}, {s.client.phone}</p>}
      <div className="mt-10 grid grid-cols-2 gap-8">
        <div className="border-t border-black pt-1">Продавец: {s.user?.name}</div>
        <div className="border-t border-black pt-1">М.П.</div>
      </div>
      <div className="mt-6 text-[11px] text-slate-500">Напечатано {dt(new Date())}</div>
    </div>
  );
}
