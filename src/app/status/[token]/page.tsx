import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { totals } from "@/lib/domain/orders";
import { rub } from "@/lib/money";

// Публичная страница: клиент видит только статус своего заказа по секретной ссылке.
export default async function PublicStatus({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const o = await prisma.order.findUnique({
    where: { publicToken: token },
    include: { status: true, company: true, location: true, items: true, payments: { select: { amount: true } } },
  });
  if (!o) notFound();
  const t = totals(o.items, o.payments.reduce((s, p) => s + p.amount, 0));
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center">
        <div className="text-sm text-slate-500">{o.company.name}</div>
        <div className="mt-1 text-lg font-semibold">Заказ № {o.number}</div>
        <div className="text-sm text-slate-600">{[o.deviceType, o.brand, o.model].filter(Boolean).join(" ")}</div>
        <div className="mt-4 inline-block rounded-full px-4 py-1 text-base font-medium" style={{ backgroundColor: o.status.color + "22", color: o.status.color }}>
          {o.status.name}
        </div>
        {t.total > 0 && <div className="mt-4 text-sm">Стоимость: {rub(t.total)}{t.due > 0 && <>, к оплате {rub(t.due)}</>}</div>}
        <div className="mt-4 text-xs text-slate-500">
          {[o.location.address, o.location.phone ?? o.company.phone].filter(Boolean).join(" · ")}
        </div>
      </div>
    </main>
  );
}
