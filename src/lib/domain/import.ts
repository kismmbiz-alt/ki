import ExcelJS from "exceljs";
import type { Tenant } from "../db";
import { normalizePhone } from "./orders";
import { createStockDoc } from "./stock";

export type Table = { head: string[]; rows: string[][] };

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return cellText(o.result);
    return "";
  }
  return String(v).trim();
};

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cur.trim());
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim());
      out.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur.trim());
    out.push(row);
  }
  return out;
}

/** Читает первый лист Excel (.xlsx) или CSV. Строка заголовков — первая, где заполнено хотя бы 2 ячейки. */
export async function readTable(file: File): Promise<Table> {
  let grid: string[][];
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    grid = parseCsv(new TextDecoder("utf-8").decode(await file.arrayBuffer()).replace(/^﻿/, ""));
  } else if (/\.xlsx$/i.test(file.name)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await file.arrayBuffer()) as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("В файле нет листов");
    grid = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals = (r.values as unknown[]).slice(1);
      grid.push(vals.map(cellText));
    });
  } else {
    throw new Error("Нужен файл Excel (.xlsx) или CSV. Старый формат .xls пересохраните в .xlsx");
  }
  const hi = grid.findIndex((r) => r.filter((c) => c).length >= 2);
  if (hi < 0) throw new Error("Не нашёл строку с заголовками");
  const head = grid[hi].map((h) => h.trim());
  const rows = grid.slice(hi + 1).filter((r) => r.some((c) => c));
  return { head, rows };
}

/** Находит колонку по словам в заголовке. Правила проверяются по порядку, занятая колонка второй раз не берётся. */
function mapColumns<K extends string>(head: string[], rules: [K, RegExp][]) {
  const used = new Set<number>();
  const map = {} as Partial<Record<K, number>>;
  for (const [key, re] of rules) {
    const i = head.findIndex((h, idx) => !used.has(idx) && re.test(h.toLowerCase()));
    if (i >= 0) {
      map[key] = i;
      used.add(i);
    }
  }
  return map;
}

export const parseNum = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/\s|₽|руб\.?/gi, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const kop = (s: string | undefined) => {
  const n = parseNum(s);
  return n === null ? null : Math.round(n * 100);
};

const PRODUCT_RULES: [string, RegExp][] = [
  ["minQty", /мин.*остат|остат.*мин|неснижаем/],
  ["qty", /кол-?во|количеств|остат/],
  ["cost", /закуп|себестоим|входн|опт/],
  ["repairPrice", /ремонт/],
  ["minPrice", /минимал|мин\.? ?цен/],
  ["price", /розни|цена продаж|^цена/],
  ["barcode", /штрих|barcode|ean/],
  ["sku", /^код|артикул|sku|^id$/],
  ["group", /групп|категор/],
  ["supplier", /поставщ/],
  ["name", /наименован|назван|^товар|^name/],
];

export type ImportReport = { created: number; updated: number; skipped: number; stockRows: number; errors: string[]; columns: Record<string, string>; preview: string[][] };

/** Загрузка товаров: совпадение по коду, иначе по названию. Количество в файле = фактический остаток на точке. */
export async function importProducts(t: Tenant, table: Table, o: { locationId: string; userId: string; dryRun: boolean }): Promise<ImportReport> {
  const m = mapColumns(table.head, PRODUCT_RULES as [keyof typeof PRODUCT_RULES & string, RegExp][]) as Record<string, number | undefined>;
  if (m.name === undefined) throw new Error("Не нашёл колонку с названием товара («Наименование»)");
  const columns = Object.fromEntries(Object.entries(m).map(([k, i]) => [k, table.head[i!]]));
  const rep: ImportReport = { created: 0, updated: 0, skipped: 0, stockRows: 0, errors: [], columns, preview: table.rows.slice(0, 8) };
  const get = (r: string[], k: string) => (m[k] !== undefined ? (r[m[k]!] ?? "").trim() : undefined);

  const existing = await t.db.product.findMany({ select: { id: true, name: true, sku: true } });
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p.id]));
  const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p.id]));
  const groups = new Map((await t.db.productGroup.findMany()).map((g) => [g.name.toLowerCase(), g.id]));
  const suppliers = new Map((await t.db.supplier.findMany()).map((s) => [s.name.toLowerCase(), s.id]));
  const stock: { productId: string; qty: number }[] = [];

  for (const [n, r] of table.rows.entries()) {
    const name = get(r, "name");
    if (!name) {
      rep.skipped++;
      continue;
    }
    const sku = get(r, "sku") || null;
    const id = (sku && bySku.get(sku.toLowerCase())) || byName.get(name.toLowerCase());
    const price = kop(get(r, "price"));
    const data = {
      name: name.slice(0, 300),
      ...(sku ? { sku } : {}),
      ...(get(r, "barcode") ? { barcode: get(r, "barcode") } : {}),
      ...(price !== null ? { price } : {}),
      ...(kop(get(r, "repairPrice")) !== null ? { repairPrice: kop(get(r, "repairPrice")) } : {}),
      ...(kop(get(r, "minPrice")) !== null ? { minPrice: kop(get(r, "minPrice")) } : {}),
      ...(kop(get(r, "cost")) !== null ? { cost: kop(get(r, "cost"))! } : {}),
      ...(parseNum(get(r, "minQty")) !== null ? { minQty: Math.max(0, Math.floor(parseNum(get(r, "minQty"))!)) } : {}),
    };
    if (o.dryRun) {
      if (id) rep.updated++;
      else rep.created++;
      if (parseNum(get(r, "qty")) !== null) rep.stockRows++;
      continue;
    }
    try {
      const gName = get(r, "group");
      let groupId: string | undefined;
      if (gName) {
        groupId = groups.get(gName.toLowerCase());
        if (!groupId) {
          groupId = (await t.db.productGroup.create({ data: { companyId: t.companyId, name: gName.slice(0, 100) } })).id;
          groups.set(gName.toLowerCase(), groupId);
        }
      }
      const sName = get(r, "supplier");
      let supplierId: string | undefined;
      if (sName) {
        supplierId = suppliers.get(sName.toLowerCase());
        if (!supplierId) {
          supplierId = (await t.db.supplier.create({ data: { companyId: t.companyId, name: sName.slice(0, 100) } })).id;
          suppliers.set(sName.toLowerCase(), supplierId);
        }
      }
      const full = { ...data, ...(groupId ? { groupId } : {}), ...(supplierId ? { supplierId } : {}) };
      let pid = id;
      if (pid) {
        await t.db.product.update({ where: { id: pid }, data: full });
        rep.updated++;
      } else {
        pid = (await t.db.product.create({ data: { companyId: t.companyId, price: 0, ...full } })).id;
        byName.set(name.toLowerCase(), pid);
        if (sku) bySku.set(sku.toLowerCase(), pid);
        rep.created++;
      }
      const q = parseNum(get(r, "qty"));
      if (q !== null && q >= 0) stock.push({ productId: pid, qty: Math.floor(q) });
    } catch (e) {
      rep.errors.push(`Строка ${n + 2}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!o.dryRun && stock.length) {
    // одна инвентаризация на весь файл: остатки становятся ровно такими, как в таблице
    const uniq = [...new Map(stock.map((s) => [s.productId, s])).values()];
    await createStockDoc(t, { type: "INVENTORY", locationId: o.locationId, userId: o.userId, comment: "Загрузка из Excel", items: uniq });
    rep.stockRows = uniq.length;
  }
  return rep;
}

const CLIENT_RULES: [string, RegExp][] = [
  ["phone", /телеф|phone|моб/],
  ["email", /почт|e-?mail/],
  ["address", /адрес/],
  ["source", /источник|реклам|откуда/],
  ["notes", /коммент|примеч|заметк/],
  ["name", /фио|имя|клиент|контрагент|наименован|name/],
];

/** Загрузка клиентов: совпадение по телефону. Строки без телефона пропускаются. */
export async function importClients(t: Tenant, table: Table, o: { dryRun: boolean }): Promise<ImportReport> {
  const m = mapColumns(table.head, CLIENT_RULES) as Record<string, number | undefined>;
  if (m.phone === undefined) throw new Error("Не нашёл колонку с телефоном");
  const columns = Object.fromEntries(Object.entries(m).map(([k, i]) => [k, table.head[i!]]));
  const rep: ImportReport = { created: 0, updated: 0, skipped: 0, stockRows: 0, errors: [], columns, preview: table.rows.slice(0, 8) };
  const get = (r: string[], k: string) => (m[k] !== undefined ? (r[m[k]!] ?? "").trim() : undefined);
  const byPhone = new Map((await t.db.client.findMany({ select: { id: true, phone: true } })).map((c) => [c.phone, c.id]));
  const sources = new Map((await t.db.adSource.findMany()).map((s) => [s.name.toLowerCase(), s.id]));

  for (const [n, r] of table.rows.entries()) {
    const phone = normalizePhone(get(r, "phone") ?? "");
    if (phone.length < 8) {
      rep.skipped++;
      continue;
    }
    const id = byPhone.get(phone);
    if (o.dryRun) {
      if (id) rep.updated++;
      else rep.created++;
      continue;
    }
    try {
      let adSourceId: string | undefined;
      const src = get(r, "source");
      if (src) {
        adSourceId = sources.get(src.toLowerCase());
        if (!adSourceId) {
          adSourceId = (await t.db.adSource.create({ data: { companyId: t.companyId, name: src.slice(0, 100) } })).id;
          sources.set(src.toLowerCase(), adSourceId);
        }
      }
      const data = {
        ...(get(r, "name") ? { name: get(r, "name")!.slice(0, 200) } : {}),
        ...(get(r, "email") ? { email: get(r, "email") } : {}),
        ...(get(r, "address") ? { address: get(r, "address") } : {}),
        ...(get(r, "notes") ? { notes: get(r, "notes") } : {}),
        ...(adSourceId ? { adSourceId } : {}),
      };
      if (id) {
        await t.db.client.update({ where: { id }, data });
        rep.updated++;
      } else {
        const c = await t.db.client.create({ data: { companyId: t.companyId, phone, name: "Без имени", ...data } });
        byPhone.set(phone, c.id);
        rep.created++;
      }
    } catch (e) {
      rep.errors.push(`Строка ${n + 2}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return rep;
}
