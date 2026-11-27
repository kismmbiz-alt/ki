// Данные для печатных форм: из заказа, продажи, складского документа, товаров (ценники),
// зарплаты и акта сверки собираем переменные в формате LiveSklad.

import type { Company, Location, User } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { totals } from "@/lib/domain/orders";
import { BUILTIN_PRICES, ensurePriceTypes, priceOf } from "@/lib/domain/prices";
import { fmtDate, type PrintCtx, type Vars } from "./engine";
import { rubWords } from "./words";

const money = (kop: number) => ({ money: kop });
const qty = (n: number) => ({ qty: n });
const d = (date: Date | null | undefined, time = false) => ({ date, time });

const WARRANTY = (days: number | null | undefined) => (days ? `${days} дн.` : "");
const PRICE_VAR = { retail: "Розничная", repair: "Ремонтная", min: "Минимальная", cost: "Закупочная" } as const;

/** Общие переменные: компания, точка, текущий пользователь, текущая дата. */
export function baseVars(company: Company, location: Location | null, user: Pick<User, "name"> & { position?: { name: string } | null; role?: string }): Vars {
  const now = new Date();
  return {
    НазваниеКомпании: company.name,
    АдресКомпании: company.address,
    ТелефонКомпании: company.phone,
    EmailКомпании: company.email,
    ИННКомпании: company.inn,
    ОГРНКомпании: company.ogrn,
    КППКомпании: company.kpp,
    РуководительКомпании: company.director,
    ДолжностьРуководителя: company.directorTitle,
    ДоговорКомпании: company.contract,
    НазваниеБанкаКомпании: company.bankName,
    РасчетныйСчетКомпании: company.account,
    КорСчетБанка: company.corrAccount,
    БИКБанка: company.bik,
    SWIFTБанка: company.swift,
    ПримечаниеКомпании: company.companyNote,
    НазваниеЛокации: location?.name ?? company.name,
    АдресЛокации: location?.address ?? company.address,
    ТелефонЛокации: location?.phone ?? company.phone,
    ФИОТекущегоПользователя: user.name,
    РольТекущегоПользователя: user.position?.name ?? user.role ?? "",
    ТекущаяДата: d(now),
    ТекущееВремя: fmtDate(now, { onlyTime: true }),
    ТекущаяДатаВремя: d(now, true),
    Валюта: company.currency === "RUB" ? "руб." : company.currency,
    Влт: company.currency === "RUB" ? "руб." : company.currency,
  };
}

function clientVars(c: { name: string; phone: string; email?: string | null; address?: string | null; notes?: string | null; inn?: string | null; birthDate?: Date | null; passport?: string | null; passportIssuedBy?: string | null; passportDate?: Date | null; passportCode?: string | null } | null): Vars {
  if (!c) return { Контрагент: "", ТелефоныКонтрагента: "" };
  return {
    Контрагент: c.name,
    ТелефоныКонтрагента: c.phone,
    ТелефонКонтрагента1: c.phone,
    EmailКонтрагента: c.email,
    АдресКонтрагента: c.address,
    ПримечаниеКонтрагента: c.notes,
    ИННКонтрагента: c.inn,
    ДатаРожденияКонтрагента: c.birthDate ? d(c.birthDate) : "",
    НомерПаспортаКонтрагента: c.passport,
    КемВыданПаспортКонтрагента: c.passportIssuedBy,
    ДатаПаспортаКонтрагента: c.passportDate ? d(c.passportDate) : "",
    КодПаспортаКонтрагента: c.passportCode,
  };
}

/** Строка позиции: цена, скидка, сумма. discountShare — доля скидки документа на эту позицию. */
function itemVars(it: { name: string; qty: number; price: number; cost: number; sku?: string | null; barcode?: string | null; warrantyDays?: number | null; serial?: string | null }, discount: number): Vars {
  const sum = it.qty * it.price;
  const after = sum - discount;
  return {
    Код: it.sku ?? "",
    КодТовара: it.sku ?? "",
    Артикул: it.sku ?? "",
    SN: it.serial ?? "",
    Наименование: it.name,
    Название: it.name,
    Гар: WARRANTY(it.warrantyDays),
    Гарант: WARRANTY(it.warrantyDays),
    Кол: qty(it.qty),
    Ед: "шт.",
    Цена: money(it.price),
    Закуп: money(it.cost),
    СуммаЗакуп: money(it.cost * it.qty),
    Наценка: money(it.price - it.cost),
    ВаловаяПрибыль: money(after - it.cost * it.qty),
    Скидка: money(discount),
    "Скидка%": sum ? { qty: Math.round((discount / sum) * 10000) / 100 } : qty(0),
    Сумма: money(sum),
    ЦенаПослеСкидки: money(it.qty ? Math.round(after / it.qty) : 0),
    СуммаПослеСкидки: money(after),
  };
}

/** Распределить скидку документа по позициям пропорционально сумме. */
function spread(discount: number, sums: number[]) {
  const total = sums.reduce((a, b) => a + b, 0);
  if (!discount || !total) return sums.map(() => 0);
  let left = discount;
  return sums.map((s, i) => {
    const part = i === sums.length - 1 ? left : Math.round((discount * s) / total);
    left -= part;
    return part;
  });
}

type Who = Pick<User, "name"> & { position?: { name: string } | null; role?: string };

export async function orderCtx(db: TenantDb, company: Company, user: Who, id: string): Promise<PrintCtx | null> {
  const o = await db.order.findUnique({
    where: { id },
    include: { client: true, location: true, master: true, manager: true, status: true, items: { orderBy: { createdAt: "asc" }, include: { product: true } }, payments: true },
  });
  if (!o) return null;
  const paid = o.payments.reduce((s, p) => s + p.amount, 0);
  const t = totals(o.items, paid, o);
  const sums = o.items.map((i) => i.qty * i.price);
  const disc = spread(t.discount, sums);
  const items = o.items.map((i, n) => itemVars({ ...i, sku: i.product?.sku, serial: null }, disc[n]));
  const works = o.items.filter((i) => i.kind === "SERVICE");
  const parts = o.items.filter((i) => i.kind === "PART");
  const sum = (xs: typeof o.items) => xs.reduce((s, i) => s + i.qty * i.price, 0);
  const maxW = Math.max(0, ...o.items.map((i) => i.warrantyDays ?? 0));
  const issued = o.closedAt;
  const vars: Vars = {
    ...baseVars(company, o.location, user),
    ...clientVars(o.client),
    ТипЗаказа: o.orderType,
    НомерДокумента: `A${o.number}`,
    ДатаДокумента: d(o.createdAt),
    ДатаДокументаПрописью: { date: o.createdAt, words: true },
    ВремяДокумента: fmtDate(o.createdAt, { onlyTime: true }),
    ДатаВремяДокумента: d(o.createdAt, true),
    ДатаВыдачи: d(issued ?? new Date()),
    ДатаВыдачиПрописью: { date: issued ?? new Date(), words: true },
    ВремяВыдачи: fmtDate(issued ?? new Date(), { onlyTime: true }),
    ДатаВремяВыдачи: d(issued ?? new Date(), true),
    ДатаГотовности: d(o.dueDate),
    ДатаВремяГотовности: d(o.dueDate, true),
    КрайнийСрок: d(o.dueDate),
    КрайнийСрокВремя: d(o.dueDate, true),
    Статус: o.status.name,
    Срочно: o.urgent ? "Срочно" : "",
    ТипУстройства: o.deviceType,
    Марка: o.brand,
    Модель: o.model,
    СерийныйНомер: o.serial,
    Цвет: o.color,
    Комплектация: o.equipment,
    ВнешнийВид: o.appearance,
    Неисправность: o.problem,
    Примечание: o.notes,
    КомментарийЗаказа: o.notes,
    Рекомендации: o.verdict,
    Выявленныйдефект: o.verdict,
    ФИОМастера: o.master?.name,
    ФИОМенеджера: o.manager?.name ?? user.name,
    Стоимость: o.estimatedPrice != null ? money(o.estimatedPrice) : "",
    Внесено: money(paid),
    ВнесеноПрописью: rubWords(paid),
    Итого: money(t.total),
    ИтогоПрописью: rubWords(t.total),
    ИтогоБезСкидки: money(t.subtotal),
    ИтогоСкидки: money(t.discount),
    ИтогоЗакуп: money(t.partsCost),
    КДоплате: money(Math.max(0, t.total - paid)),
    СуммаРаботы: money(sum(works)),
    ИтогоРаботы: money(sum(works)),
    ИтогоРаботыПрописью: rubWords(sum(works)),
    СуммаТовары: money(sum(parts)),
    ИтогоТовары: money(sum(parts)),
    ИтогоТоварыПрописью: rubWords(sum(parts)),
    СкидкаРаботы: money(0),
    СкидкаТовары: money(0),
    ВсегоРабот: String(works.length),
    ВсегоТоваров: String(parts.length),
    ВсегоПозиций: String(o.items.length),
    ИтогоКолРабот: qty(works.reduce((s, i) => s + i.qty, 0)),
    ИтогоКолТоваров: qty(parts.reduce((s, i) => s + i.qty, 0)),
    ИтогоКол: qty(o.items.reduce((s, i) => s + i.qty, 0)),
    МаксГарант: WARRANTY(maxW || company.warrantyDays),
    МаксГарантДо: maxW ? d(new Date((issued ?? new Date()).getTime() + maxW * 86400000)) : "",
    Штрихкод: { barcode: `A${o.number}` },
    ШтрихкодСлева: { barcode: `A${o.number}` },
    ШтрихкодСправа: { barcode: `A${o.number}` },
  };
  return { vars, items };
}

export async function saleCtx(db: TenantDb, company: Company, user: Who, id: string): Promise<PrintCtx | null> {
  const s = await db.sale.findUnique({ where: { id }, include: { client: true, location: true, user: true, items: { include: { product: true } }, transactions: true } });
  if (!s) return null;
  const sign = s.isReturn ? -1 : 1;
  const list = s.items.map((i) => ({ ...i, qty: Math.abs(i.qty) }));
  const sums = list.map((i) => i.qty * i.price);
  const subtotal = sums.reduce((a, b) => a + b, 0);
  const disc = spread(s.discount, sums);
  const total = Math.abs(s.total);
  const paid = Math.abs(s.transactions.reduce((a, t) => a + t.amount, 0));
  const items = list.map((i, n) => itemVars({ ...i, sku: i.product.sku, barcode: i.product.barcode }, disc[n]));
  const vars: Vars = {
    ...baseVars(company, s.location, s.user ?? user),
    ...clientVars(s.client),
    НомерДокумента: s.isReturn ? `Возврат ${s.number}` : `B${s.number}`,
    ДатаДокумента: d(s.createdAt),
    ДатаДокументаПрописью: { date: s.createdAt, words: true },
    ВремяДокумента: fmtDate(s.createdAt, { onlyTime: true }),
    ДатаВремяДокумента: d(s.createdAt, true),
    ДатаВыдачи: d(s.createdAt),
    Итого: money(total),
    ИтогоПрописью: rubWords(total),
    ИтогоБезСкидки: money(subtotal),
    ИтогоСкидки: money(s.discount),
    ИтогоТовары: money(total),
    СуммаТовары: money(subtotal),
    СкидкаТовары: money(s.discount),
    ИтогоТоварыПрописью: rubWords(total),
    ИтогоЗакуп: money(list.reduce((a, i) => a + i.cost * i.qty, 0)),
    Внесено: money(paid),
    ВнесеноПрописью: rubWords(paid),
    КДоплате: money(Math.max(0, total - paid)),
    ВсегоПозиций: String(list.length),
    ВсегоТоваров: String(list.length),
    ИтогоКол: qty(list.reduce((a, i) => a + i.qty, 0)),
    МаксГарант: WARRANTY(company.warrantyDays),
    ФИОМенеджера: s.user?.name,
    Штрихкод: { barcode: `B${s.number}` },
    _sign: String(sign),
  };
  return { vars, items };
}

const DOC_NAME: Record<string, string> = { RECEIPT: "Поступление", TRANSFER: "Перемещение", WRITEOFF: "Списание", INVENTORY: "Инвентаризация", SUPPLIER_RETURN: "Возврат поставщику" };

export async function stockDocCtx(db: TenantDb, company: Company, user: Who, id: string): Promise<PrintCtx | null> {
  const doc = await db.stockDoc.findUnique({ where: { id }, include: { location: true, toLocation: true, warehouse: true, toWarehouse: true, supplier: true, items: { include: { product: true } } } });
  if (!doc) return null;
  const isInv = doc.type === "INVENTORY";
  // для инвентаризации qty — разница; учётный остаток неизвестен, печатаем разницу и сумму по себестоимости
  const items = doc.items.map((i) =>
    ({
      ...itemVars({ name: i.name, qty: Math.abs(i.qty), price: i.product.price, cost: i.cost, sku: i.product.sku, barcode: i.product.barcode }, 0),
      ...(isInv ? { Отклонение: qty(i.qty), Учет: "", СуммаУчет: money(0) } : {}),
    }) as Vars,
  );
  const costTotal = doc.items.reduce((s, i) => s + Math.abs(i.qty) * i.cost, 0);
  const priceTotal = doc.items.reduce((s, i) => s + Math.abs(i.qty) * i.product.price, 0);
  const vars: Vars = {
    ...baseVars(company, doc.location, user),
    Контрагент: doc.supplier?.name ?? "",
    ТелефоныКонтрагента: doc.supplier?.phone ?? "",
    НомерДокумента: `${DOC_NAME[doc.type] ?? ""} ${doc.number}`.trim(),
    ДатаДокумента: d(doc.createdAt),
    ДатаДокументаПрописью: { date: doc.createdAt, words: true },
    НазваниеОтправителя: `${doc.warehouse.name} (${doc.location.name})`,
    НазваниеПолучателя: doc.toWarehouse ? `${doc.toWarehouse.name}${doc.toLocation ? ` (${doc.toLocation.name})` : ""}` : "",
    Примечание: doc.comment,
    ИтогоЗакуп: money(costTotal),
    ИтогоЗакупПрописью: rubWords(costTotal),
    Итого: money(priceTotal),
    ИтогоПрописью: rubWords(priceTotal),
    ИтогоУчет: money(0),
    ВсегоПозиций: String(doc.items.length),
    ИтогоКол: qty(doc.items.reduce((s, i) => s + Math.abs(i.qty), 0)),
  };
  return { vars, items };
}

/** Ценники: по одной этикетке на каждую штуку. */
export async function priceTagCtxs(db: TenantDb, company: Company, user: Who, ids: string[], counts: Record<string, number>): Promise<PrintCtx[]> {
  const [products, types] = await Promise.all([db.product.findMany({ where: { id: { in: ids } }, include: { prices: true } }), ensurePriceTypes(db, company.id)]);
  const base = baseVars(company, null, user);
  const out: PrintCtx[] = [];
  for (const id of ids) {
    const p = products.find((x) => x.id === id);
    if (!p) continue;
    const priceVars: Vars = {};
    for (const b of BUILTIN_PRICES) priceVars[PRICE_VAR[b.key]] = money(priceOf(p, b.key));
    for (const t of types) priceVars[t.name.replace(/\s+/g, "")] = money(priceOf(p, t.id));
    const vars: Vars = {
      ...base,
      ...priceVars,
      Наименование: p.name,
      Название: p.name,
      Код: p.sku ?? "",
      КодТовара: p.sku ?? "",
      Артикул: p.sku ?? "",
      Цена: money(p.price),
      Гарант: WARRANTY(company.warrantyDays),
      Примечание: "",
      Штрихкод: { barcode: p.barcode ?? p.sku ?? "" },
      ШтрихкодКод: { barcode: p.barcode ?? p.sku ?? "" },
      ШтрихкодСлева: { barcode: p.barcode ?? "" },
      ШтрихкодСправа: { barcode: p.barcode ?? "" },
    };
    const n = Math.max(1, Math.min(500, counts[id] ?? 1));
    for (let i = 0; i < n; i++) out.push({ vars });
  }
  return out;
}

/** Зарплатная ведомость / РКО по выплате. */
export async function salaryCtx(db: TenantDb, company: Company, user: Who, opts: { userId: string; from: Date; to: Date; rows: { label: string; amount: number }[]; payout: number; comment?: string | null }): Promise<PrintCtx | null> {
  const emp = await db.user.findUnique({ where: { id: opts.userId } });
  if (!emp) return null;
  const total = opts.rows.reduce((s, r) => s + r.amount, 0);
  const rowsHtml = `<table style="width:100%;border-collapse:collapse">${opts.rows
    .map((r) => `<tr><td style="border:1px solid #000;padding:2px 4px">${r.label.replace(/[<>&]/g, "")}</td><td style="border:1px solid #000;padding:2px 4px;text-align:right">${(r.amount / 100).toFixed(2)}</td></tr>`)
    .join("")}</table>`;
  const period = `${fmtDate(opts.from)} — ${fmtDate(new Date(opts.to.getTime() - 1))}`;
  return {
    rowsHtml,
    vars: {
      ...baseVars(company, null, user),
      ФИОСотрудника: emp.name,
      ФИООтветственногоСотрудника: user.name,
      ОплачиваемыйПериод: period,
      Сумма: money(total),
      СуммаПрописью: rubWords(total),
      Выплата: money(opts.payout),
      ВыплатаПрописью: rubWords(opts.payout),
      Примечание: opts.comment ?? "",
      НомерДокумента: "",
      ДатаДокумента: d(new Date()),
    },
  };
}

/** Акт сверки с клиентом: заказы и продажи — дебет, оплаты — кредит. */
export async function clientReportCtx(db: TenantDb, company: Company, user: Who, clientId: string, from: Date, to: Date): Promise<PrintCtx | null> {
  const c = await db.client.findUnique({ where: { id: clientId } });
  if (!c) return null;
  const [orders, sales, pays] = await Promise.all([
    db.order.findMany({ where: { clientId, closedAt: { not: null } }, include: { items: true } }),
    db.sale.findMany({ where: { clientId } }),
    db.cashTransaction.findMany({ where: { OR: [{ order: { clientId } }, { sale: { clientId } }] }, include: { order: true, sale: true } }),
  ]);
  type Row = { date: Date; label: string; debit: number; credit: number };
  const rows: Row[] = [];
  for (const o of orders) rows.push({ date: o.closedAt!, label: `Заказ A${o.number}`, debit: totals(o.items, 0, o).total, credit: 0 });
  for (const s of sales) rows.push({ date: s.createdAt, label: s.isReturn ? `Возврат ${s.number}` : `Продажа B${s.number}`, debit: Math.max(0, s.total), credit: Math.max(0, -s.total) });
  for (const p of pays) rows.push({ date: p.createdAt, label: `Оплата ${p.order ? `заказа A${p.order.number}` : p.sale ? `продажи B${p.sale.number}` : ""}`, debit: p.amount < 0 ? -p.amount : 0, credit: p.amount > 0 ? p.amount : 0 });
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const before = rows.filter((r) => r.date < from);
  const inside = rows.filter((r) => r.date >= from && r.date < to);
  const startBal = before.reduce((s, r) => s + r.debit - r.credit, 0);
  const turnD = inside.reduce((s, r) => s + r.debit, 0);
  const turnC = inside.reduce((s, r) => s + r.credit, 0);
  const endBal = startBal + turnD - turnC;
  return {
    vars: {
      ...baseVars(company, null, user),
      ...clientVars(c),
      НачалоПериода: d(from),
      КонецПериода: d(new Date(to.getTime() - 1)),
      НачальныйДебет: money(Math.max(0, startBal)),
      НачальныйКредит: money(Math.max(0, -startBal)),
      ОборотДебет: money(turnD),
      ОборотКредит: money(turnC),
      ИтогДебет: money(Math.max(0, endBal)),
      ИтогКредит: money(Math.max(0, -endBal)),
      Задолженность: money(Math.abs(endBal)),
      ЗадолженностьПрописью: rubWords(Math.abs(endBal)),
      Кредитор: endBal > 0 ? company.name : endBal < 0 ? c.name : "—",
    },
    items: inside.map((r) => ({ Дата: d(r.date), Позиция: r.label, Дебет: money(r.debit), Кредит: money(r.credit) })),
  };
}
