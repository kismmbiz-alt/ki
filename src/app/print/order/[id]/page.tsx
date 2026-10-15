import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { rub } from "@/lib/money";
import { totals } from "@/lib/domain/orders";
import { dOnly, dt } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export default async function PrintOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const { id } = await params;
  const { doc = "receipt" } = await searchParams;
  const { db, company, user } = await requireUser();
  const o = await db.order.findUnique({
    where: { id },
    include: { client: true, location: true, author: true, master: true, items: true, payments: true },
  });
  if (!o) notFound();
  if (!can(user.role, "allOrders") && o.masterId !== user.id) notFound();
  const t = totals(o.items, o.payments.reduce((s, p) => s + p.amount, 0));
  const device = [o.deviceType, o.brand, o.model].filter(Boolean).join(" ");

  if (doc === "label") {
    return (
      <div className="p-4">
        <PrintButton />
        <div className="w-[58mm] border border-dashed border-slate-300 p-2 text-[11px] leading-tight">
          <div className="text-lg font-bold">№ {o.number}</div>
          <div>{o.client.name} · {o.client.phone}</div>
          <div>{device}</div>
          <div className="truncate">{o.problem}</div>
          <div>{dOnly(o.createdAt)}</div>
        </div>
      </div>
    );
  }

  const isAct = doc === "act";
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <PrintButton />
      <div className="flex justify-between border-b border-black pb-2">
        <div>
          <div className="text-base font-bold">{company.name}</div>
          <div>{[o.location.address ?? company.address, o.location.phone ?? company.phone].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold">{isAct ? "Акт выполненных работ" : "Квитанция о приёме"}</div>
          <div>
            к заказу № {o.number} от {dOnly(o.createdAt)}
          </div>
        </div>
      </div>

      <table className="mt-4 w-full">
        <tbody>
          <R k="Клиент" v={`${o.client.name}, ${o.client.phone}`} />
          <R k="Устройство" v={device} />
          {o.serial && <R k="Серийный номер / IMEI" v={o.serial} />}
          <R k="Неисправность" v={o.problem} />
          {o.equipment && <R k="Комплектация" v={o.equipment} />}
          {o.appearance && <R k="Внешний вид" v={o.appearance} />}
          {!isAct && o.estimatedPrice && <R k="Ориентировочная стоимость" v={rub(o.estimatedPrice)} />}
          {!isAct && o.dueDate && <R k="Ориентировочный срок" v={dOnly(o.dueDate)} />}
          {!isAct && t.paid > 0 && <R k="Оплачено" v={rub(t.paid)} />}
        </tbody>
      </table>

      {isAct && (
        <>
          <table className="mt-4 w-full border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1">Наименование</th>
                <th className="py-1 text-right">Кол-во</th>
                <th className="py-1 text-right">Цена</th>
                <th className="py-1 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((i) => (
                <tr key={i.id} className="border-b border-slate-300">
                  <td className="py-1">{i.name}</td>
                  <td className="py-1 text-right">{i.qty}</td>
                  <td className="py-1 text-right">{rub(i.price)}</td>
                  <td className="py-1 text-right">{rub(i.qty * i.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-right">
            <div>Итого: <b>{rub(t.total)}</b></div>
            <div>Оплачено: {rub(t.paid)}</div>
          </div>
          <p className="mt-4">
            Гарантия на выполненные работы и установленные запчасти: {company.warrantyDays} дней с даты выдачи. Работы выполнены
            полностью, устройство проверено в присутствии клиента, претензий к качеству и срокам не имею.
          </p>
        </>
      )}

      {!isAct && company.receiptTerms && <p className="mt-4 whitespace-pre-line text-[12px]">{company.receiptTerms}</p>}
      {!isAct && (
        <p className="mt-2 text-[12px]">
          Я даю согласие на обработку моих персональных данных (имя, телефон) для исполнения заказа и уведомления о его статусе.
        </p>
      )}

      <div className="mt-10 grid grid-cols-2 gap-8">
        <div>
          <div className="border-t border-black pt-1">{isAct ? "Выдал" : "Принял"}: {isAct ? user.name : o.author.name}</div>
        </div>
        <div>
          <div className="border-t border-black pt-1">Клиент: {o.client.name}</div>
        </div>
      </div>
      <div className="mt-6 text-[11px] text-slate-500">Напечатано {dt(new Date())}</div>
    </div>
  );
}

function R({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="w-56 py-0.5 align-top text-slate-600">{k}</td>
      <td className="py-0.5">{v}</td>
    </tr>
  );
}
