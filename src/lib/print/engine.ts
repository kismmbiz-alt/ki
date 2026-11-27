// Движок печатных форм в формате LiveSklad: HTML с переменными вида &lt;Имя(формат)&gt;.
// Строки таблицы с классом wp-table, в которых есть переменные позиции (<№>, <Наименование>…),
// повторяются для каждой позиции документа.

import { barcodeSvg } from "@/lib/barcode";
import { rubWords } from "./words";

/** Значение переменной: текст, деньги (коп.), количество, дата или штрихкод. */
export type Val =
  | string
  | null
  | undefined
  | { money: number }
  | { qty: number }
  | { date: Date | null | undefined; time?: boolean; words?: boolean }
  | { barcode: string }
  | { html: string };

export type Vars = Record<string, Val>;
export type PrintCtx = { vars: Vars; items?: Vars[]; rowsHtml?: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 1234567.8 → «1 234 567.80» (как в LiveSklad). */
export function fmtNum(n: number, decimals: number) {
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "-" : "") + grouped + (frac ? "." + frac : "");
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const TZ = process.env.APP_TZ || "Asia/Yekaterinburg";

function dateParts(d: Date) {
  const f = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { dd: p.day, mm: p.month, yyyy: p.year, hh: p.hour === "24" ? "00" : p.hour, mi: p.minute };
}

export function fmtDate(d: Date | null | undefined, opts: { time?: boolean; words?: boolean; onlyTime?: boolean } = {}) {
  if (!d) return "";
  const p = dateParts(d);
  if (opts.onlyTime) return `${p.hh}:${p.mi}`;
  if (opts.words) return `«${p.dd}» ${MONTHS[Number(p.mm) - 1]} ${p.yyyy} г.`;
  return `${p.dd}.${p.mm}.${p.yyyy}${opts.time ? ` ${p.hh}:${p.mi}` : ""}`;
}

/** Размер вида «100:20» или «33mm:7mm» → css-размеры. */
function box(arg: string) {
  const m = arg.match(/^\s*([\d.]+)(mm|px)?\s*:\s*([\d.]+)(mm|px)?\s*$/);
  if (!m) return null;
  return { w: `${m[1]}${m[2] ?? "px"}`, h: `${m[3]}${m[4] ?? "px"}` };
}

/** Значение одной переменной с форматом. */
export function renderVal(v: Val, arg: string | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") {
    if (!arg) return esc(v).replace(/\n/g, "<br>");
    const b = box(arg);
    if (b) return `<span style="display:inline-block;width:${b.w};max-height:${b.h};overflow:hidden;vertical-align:top;line-height:1.15">${esc(v)}</span>`;
    const n = Number(arg);
    if (Number.isFinite(n) && n > 0) return esc(v.length > n ? v.slice(0, n) + "…" : v);
    // «(100:40)» без размеров — перенос по ширине
    const wrap = arg.match(/^(\d+):(\d+)$/);
    if (wrap) return esc(v.slice(0, Number(wrap[1])));
    return esc(v);
  }
  if ("money" in v) {
    const rub = v.money / 100;
    if (arg === "#") return fmtNum(Math.round(rub), 0);
    return fmtNum(rub, 2);
  }
  if ("qty" in v) {
    const m = arg?.match(/^#(?:\.(#+))?$/);
    const dec = m ? (m[1]?.length ?? 0) : 0;
    return fmtNum(v.qty, Number.isInteger(v.qty) ? 0 : Math.max(dec, 0));
  }
  if ("date" in v) return fmtDate(v.date, { time: v.time, words: v.words });
  if ("barcode" in v) {
    const b = arg ? box(arg) : null;
    if (!v.barcode) return "";
    const svg = barcodeSvg(v.barcode, { height: 40, label: true });
    if (b) return `<span style="display:inline-block;width:${b.w};height:${b.h}">${svg.replace(/style="[^"]*"/, 'style="width:100%;height:100%;display:block"')}</span>`;
    return svg;
  }
  if ("html" in v) return v.html;
  return "";
}

const VAR_RE = /&lt;([^&<>]{1,80}?)&gt;/g;

/** Подставить переменные в кусок HTML. */
export function fillVars(html: string, vars: Vars, extra?: Vars) {
  return html.replace(VAR_RE, (whole, raw: string) => {
    const s = raw.replace(/&nbsp;/g, " ").trim();
    const m = s.match(/^(.+?)\s*\(([^)]*)\)$/);
    const name = (m ? m[1] : s).trim();
    const arg = m ? m[2].trim() : undefined;
    const key = extra && name in extra ? extra : name in vars ? vars : null;
    if (!key) return KNOWN_EMPTY.has(name) ? "" : whole;
    return renderVal(key[name], arg);
  });
}

/** Переменные, которые бывают в бланках LiveSklad, но у нас пока не заполняются — печатаем пусто. */
const KNOWN_EMPTY = new Set([
  "ПодменноеУстройство", "ДатаПокупки", "Выявленныйдефект", "Срочно", "РекламныйИсточникДокумента", "РекламныйИсточникКонтрагента",
  "ОтправлятьСмс", "ОтправлятьТелеграм", "ОтправлятьEmail", "ТелеграмКонтрагента", "ДиректорКонтрагента", "ДоговорКонтрагента",
  "ОГРНКонтрагента", "КППКонтрагента", "ИННКонтрагента", "БИККонтрагента", "SWIFTКонтрагента", "КорСчетКонтрагента", "РасчетныйСчетКонтрагента",
  "НазваниеБанкаКонтрагента", "НомерПаспортаКонтрагента", "КемВыданПаспортКонтрагента", "ДатаПаспортаКонтрагента", "КодПаспортаКонтрагента",
  "ДатаРожденияКонтрагента", "МестоРожденияКонтрагента", "АдресКонтрагента", "EmailКонтрагента", "Цвет", "SN", "Артикул", "Описание", "Модификация",
  "Комментарий", "Исполнитель", "Фото", "Фото2", "Фото3", "КДоплате", "Внесено", "Рекомендации", "Примечание", "Комплектация", "ВнешнийВид",
]);

/** Позиция конца тега <table …> с учётом вложенных таблиц. */
function tableEnd(html: string, start: number) {
  const re = /<\/?table\b[^>]*>/gi;
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return html.length;
}

/** Строки <tr> верхнего уровня таблицы. */
function topRows(table: string) {
  const rows: { start: number; end: number }[] = [];
  const re = /<(\/?)(table|tr)\b[^>]*>/gi;
  let depth = 0;
  let rowStart = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(table))) {
    const close = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "table") depth += close ? -1 : 1;
    else if (depth === 1) {
      if (!close) rowStart = m.index;
      else if (rowStart >= 0) {
        rows.push({ start: rowStart, end: m.index + m[0].length });
        rowStart = -1;
      }
    }
  }
  return rows;
}

const ITEM_VARS = /&lt;(№|Код|КодТовара|Артикул|SN|Наименование|Название|Модификация|Комментарий|Описание|Гар|Гарант|ГарантДо|Кол|Ед|Цена|Закуп|Наценка|ВаловаяПрибыль|Скидка|Скидка%|Сумма|СуммаЗакуп|ЦенаПослеСкидки|СуммаПослеСкидки|Исполнитель|Учет|Отклонение|СуммаУчет|Дата|Позиция|Дебет|Кредит)(\([^)]*\))?\s*&gt;/;

/** Размножить строки позиций в таблицах wp-table (и в любых таблицах, где есть <№>). */
export function expandTables(html: string, items: Vars[], vars: Vars) {
  let out = "";
  let pos = 0;
  const re = /<table\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index < pos) continue;
    const end = tableEnd(html, m.index);
    const table = html.slice(m.index, end);
    const isItems = /wp-table/.test(m[0]) || /&lt;№&gt;/.test(table);
    if (!isItems) continue;
    const rows = topRows(table);
    const itemRow = rows.find((r) => ITEM_VARS.test(table.slice(r.start, r.end)));
    if (!itemRow) continue;
    const tpl = table.slice(itemRow.start, itemRow.end);
    const filled = items.map((it, i) => fillVars(tpl, vars, { "№": String(i + 1), ...it })).join("");
    out += html.slice(pos, m.index) + table.slice(0, itemRow.start) + filled + table.slice(itemRow.end);
    pos = end;
    re.lastIndex = end;
  }
  return out + html.slice(pos);
}

/** Собрать готовый HTML одного документа. scope — уникальный класс, чтобы стили бланков не пересекались. */
export function renderTemplate(html: string, ctx: PrintCtx, scope: string) {
  let body = html.replace(/<style>([\s\S]*?)<\/style>/g, (_, css: string) => `<style>${css.replace(/(^|\})\s*\.([\w-]+)/g, `$1 .${scope} .$2`)}</style>`);
  if (ctx.rowsHtml != null) body = body.replace(/&lt;СтрокиТаблицы&gt;/g, ctx.rowsHtml);
  body = expandTables(body, ctx.items ?? [], ctx.vars);
  body = fillVars(body, ctx.vars);
  return body;
}

/** Деньги прописью для переменных …Прописью. */
export const moneyWords = (kop: number) => rubWords(kop);
