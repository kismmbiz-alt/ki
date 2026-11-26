import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { rub } from "@/lib/money";
import { totals } from "@/lib/domain/orders";
import { dOnly, dt } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

const KNOWN = ["receipt", "act", "warranty", "refusal", "check", "label"] as const;
type Doc = (typeof KNOWN)[number];

const TITLE: Record<Doc, string> = {
  receipt: "Квитанция о приёме",
  act: "Акт выполненных работ",
  warranty: "Гарантийный талон",
  refusal: "Отказной лист",
  check: "Товарный чек",
  label: "Наклейка",
};

export default async function PrintOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string; docs?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const docs = (sp.docs ?? sp.doc ?? "receipt").split(",").filter((d): d is Doc => (KNOWN as readonly string[]).includes(d));
  const { db, company, user } = await requireUser();
  const o = await db.order.findUnique({
    where: { id },
    include: { client: true, location: true, author: true, master: true, manager: true, items: { orderBy: { createdAt: "asc" } }, payments: true },
  });
  if (!o) notFound();
  if (!can(user.role, "allOrders") && o.masterId !== user.id) notFound();
  const t = totals(o.items, o.payments.reduce((s, p) => s + p.amount, 0), o);
  const device = [o.deviceType, o.brand, o.model].filter(Boolean).join(" ");
  const issued = o.closedAt ?? new Date();
  const contacts = [o.location.address ?? company.address, o.location.phone ?? company.phone].filter(Boolean).join(" · ");

  const Header = ({ doc }: { doc: Doc }) => (
    <div className="flex justify-between gap-6 border-b-2 border-black pb-2">
      <div>
        <div className="text-base font-bold">{company.name}</div>
        <div className="text-[12px]">{contacts}</div>
      </div>
      <div className="text-right">
        <div className="text-base font-bold">{TITLE[doc]}</div>
        <div>
          к заказу № {o.number} от {dOnly(o.createdAt)}
        </div>
      </div>
    </div>
  );

  const DeviceTable = ({ full }: { full?: boolean }) => (
    <table className="mt-4 w-full">
      <tbody>
        <R k="Клиент" v={`${o.client.name}, ${o.client.phone}`} />
        <R k="Устройство" v={[device, o.color].filter(Boolean).join(", ")} />
        {o.serial && <R k="Серийный номер / IMEI" v={o.serial} />}
        <R k="Неисправность (со слов клиента)" v={o.problem} />
        {full && o.equipment && <R k="Комплектация" v={o.equipment} />}
        {full && o.appearance && <R k="Внешний вид" v={o.appearance} />}
      </tbody>
    </table>
  );

  const Items = ({ withWarranty }: { withWarranty?: boolean }) => (
    <>
      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1">№</th>
            <th className="py-1">Наименование</th>
            {withWarranty && <th className="py-1 text-right">Гарантия</th>}
            <th className="py-1 text-right">Кол-во</th>
            <th className="py-1 text-right">Цена</th>
            <th className="py-1 text-right">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i, n) => (
            <tr key={i.id} className="border-b border-slate-300">
              <td className="py-1">{n + 1}</td>
              <td className="py-1">{i.name}</td>
              {withWarranty && <td className="py-1 text-right">{(i.warrantyDays ?? company.warrantyDays) ? `${i.warrantyDays ?? company.warrantyDays} дн.` : "—"}</td>}
              <td className="py-1 text-right">{i.qty}</td>
              <td className="py-1 text-right">{rub(i.price)}</td>
              <td className="py-1 text-right">{rub(i.qty * i.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-right">
        {t.discount > 0 && <div>Скидка: −{rub(t.discount)}</div>}
        <div>
          Итого: <b>{rub(t.total)}</b>
        </div>
        <div>Оплачено: {rub(t.paid)}</div>
        {t.due > 0 && <div>К оплате: {rub(t.due)}</div>}
      </div>
    </>
  );

  const Signs = ({ left, right }: { left: string; right: string }) => (
    <div className="mt-10 grid grid-cols-2 gap-8">
      <div className="border-t border-black pt-1">{left}</div>
      <div className="border-t border-black pt-1">{right}</div>
    </div>
  );

  const render = (doc: Doc) => {
    if (doc === "label")
      return (
        <div className="w-[58mm] border border-dashed border-slate-400 p-2 text-[11px] leading-tight">
          <div className="text-lg font-bold">№ {o.number}</div>
          <div>
            {o.client.name} · {o.client.phone}
          </div>
          <div>{device}</div>
          <div className="truncate">{o.problem}</div>
          <div>{dOnly(o.createdAt)}</div>
        </div>
      );
    if (doc === "receipt")
      return (
        <>
          <Header doc={doc} />
          <DeviceTable full />
          <table className="w-full">
            <tbody>
              {o.estimatedPrice && <R k="Ориентировочная стоимость" v={rub(o.estimatedPrice)} />}
              {o.dueDate && <R k="Ориентировочный срок" v={dt(o.dueDate)} />}
              {t.paid > 0 && <R k="Предоплата" v={rub(t.paid)} />}
            </tbody>
          </table>
          {company.receiptTerms && <p className="mt-4 text-[12px] whitespace-pre-line">{company.receiptTerms}</p>}
          <p className="mt-2 text-[12px]">
            Я даю согласие на обработку моих персональных данных (имя, телефон) для исполнения заказа и уведомления о его статусе.
          </p>
          <Signs left={`Принял: ${o.author.name}`} right={`Клиент: ${o.client.name}`} />
        </>
      );
    if (doc === "act")
      return (
        <>
          <Header doc={doc} />
          <DeviceTable />
          <Items />
          {o.verdict && <p className="mt-3">Заключение: {o.verdict}</p>}
          <p className="mt-4 text-[12px]">
            Работы выполнены полностью, устройство проверено в присутствии клиента. Претензий к качеству, срокам и комплектации не имею.
            Дата выдачи: {dOnly(issued)}.
          </p>
          <Signs left={`Выдал: ${user.name}`} right={`Клиент: ${o.client.name}`} />
        </>
      );
    if (doc === "warranty")
      return (
        <>
          <Header doc={doc} />
          <DeviceTable />
          <Items withWarranty />
          <div className="mt-4 space-y-1 text-[12px]">
            <p>Гарантийный срок исчисляется с даты выдачи устройства: {dOnly(issued)}.</p>
            <p>Гарантия распространяется только на выполненные работы и установленные запчасти, указанные в этом талоне.</p>
            <p>
              Гарантия не действует при механических повреждениях, следах вскрытия посторонними лицами, попадании влаги, нарушении правил эксплуатации, а
              также при повреждении гарантийных наклеек.
            </p>
            <p>При обращении по гарантии необходимо предъявить этот талон и устройство в полной комплектации.</p>
          </div>
          <Signs left={`Мастер: ${o.master?.name ?? user.name}`} right={`Клиент: ${o.client.name}`} />
        </>
      );
    if (doc === "refusal")
      return (
        <>
          <Header doc={doc} />
          <DeviceTable full />
          {o.verdict && <p className="mt-3">Заключение мастера: {o.verdict}</p>}
          <p className="mt-4">
            Я, {o.client.name}, отказываюсь от проведения ремонта указанного устройства. Устройство получено мной в том же состоянии и комплектации, в
            которых было сдано. Претензий к мастерской не имею.
          </p>
          {t.total > 0 && (
            <p className="mt-2">
              Стоимость диагностики и выполненных работ: <b>{rub(t.total)}</b>
              {t.due > 0 ? `, к оплате ${rub(t.due)}` : ", оплачено"}.
            </p>
          )}
          <Signs left={`Выдал: ${user.name}`} right={`Клиент: ${o.client.name}`} />
        </>
      );
    // товарный чек
    return (
      <>
        <div className="text-center">
          <div className="text-base font-bold">{company.name}</div>
          <div className="text-[12px]">{contacts}</div>
          <div className="mt-3 text-base font-bold">
            Товарный чек № {o.number} от {dOnly(issued)}
          </div>
        </div>
        <Items />
        <p className="mt-3">
          Всего наименований {o.items.length}, на сумму {rub(t.total)}.
        </p>
        <Signs left={`Продавец: ${user.name}`} right="М.П." />
      </>
    );
  };

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <PrintButton />
      {docs.map((d, i) => (
        <section key={d} className={i < docs.length - 1 ? "page-break mb-12 border-b border-dashed border-slate-300 pb-12 print:mb-0 print:border-0 print:pb-0" : ""}>
          {render(d)}
          {d !== "label" && <div className="mt-6 text-[11px] text-slate-500">Напечатано {dt(new Date())}</div>}
        </section>
      ))}
    </div>
  );
}

function R({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="w-64 py-0.5 align-top text-slate-600">{k}</td>
      <td className="py-0.5">{v}</td>
    </tr>
  );
}
