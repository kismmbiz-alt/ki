// Печатные формы компании: при первом обращении копируем все бланки LiveSklad.

import type { PrintTemplate } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import SEED from "./livesklad-templates.json";

type Seed = { source: string; docType: string; name: string; pageSize: string; width: number | null; height: number | null; landscape: boolean; margins: number[]; sort: number; html: string };
export const SEED_TEMPLATES = SEED as Seed[];

/** Виды документов: где печатается бланк. */
export const DOC_TYPES = [
  { key: "order", label: "Заказы (ремонт)" },
  { key: "sale", label: "Продажи и возвраты" },
  { key: "invoice", label: "Счета, ТОРГ-12, УПД" },
  { key: "receipt", label: "Поступления и скупка" },
  { key: "supplier_return", label: "Возвраты поставщику" },
  { key: "writeoff", label: "Списания" },
  { key: "transfer", label: "Перемещения" },
  { key: "inventory", label: "Инвентаризации" },
  { key: "price_tag", label: "Ценники и этикетки" },
  { key: "client_report", label: "Акт сверки с клиентом" },
  { key: "salary", label: "Зарплата" },
] as const;
export type DocType = (typeof DOC_TYPES)[number]["key"];
export const docTypeLabel = (k: string) => DOC_TYPES.find((d) => d.key === k)?.label ?? k;

/** Стандартные размеры листа, мм. */
export const PAGE_SIZES: Record<string, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  A6: [105, 148],
  A7: [74, 105],
  B5: [176, 250],
  Letter: [216, 279],
};

/** Какие бланки можно печатать из документа данного вида (счета — из заказа и продажи). */
export function typesFor(kind: "order" | "sale" | "stock" | "product" | "client" | "salary", stockType?: string): string[] {
  switch (kind) {
    case "order":
      return ["order", "invoice"];
    case "sale":
      return ["sale", "invoice"];
    case "stock":
      return [({ RECEIPT: "receipt", SUPPLIER_RETURN: "supplier_return", WRITEOFF: "writeoff", TRANSFER: "transfer", INVENTORY: "inventory" } as Record<string, string>)[stockType ?? ""] ?? "receipt"];
    case "product":
      return ["price_tag"];
    case "client":
      return ["client_report"];
    case "salary":
      return ["salary"];
  }
}

/** Бланк по умолчанию для вида документа. */
const PREFERRED: Record<string, string> = {
  order: "Квитанция о приеме",
  sale: "Товарный чек",
  invoice: "Счет",
  price_tag: "Ценник 58х40",
  salary: "Расходный кассовый ордер з/п",
};

const seedData = (companyId: string, s: Seed, isDefault: boolean) => ({
  companyId,
  docType: s.docType,
  name: s.name,
  html: s.html,
  pageSize: s.pageSize,
  width: s.width,
  height: s.height,
  landscape: s.landscape,
  margins: s.margins,
  sort: s.sort,
  source: s.source,
  isDefault,
});

/** Бланки компании; если их ещё нет — создаём из набора LiveSklad. */
export async function ensureTemplates(db: TenantDb, companyId: string): Promise<PrintTemplate[]> {
  const n = await db.printTemplate.count({ where: { companyId } });
  if (!n) {
    const seen = new Set<string>();
    await db.printTemplate.createMany({
      data: SEED_TEMPLATES.map((s) => {
        const pref = PREFERRED[s.docType];
        const def = pref ? s.name === pref : !seen.has(s.docType);
        seen.add(s.docType);
        return seedData(companyId, s, def);
      }),
    });
  }
  return db.printTemplate.findMany({ where: { companyId }, orderBy: [{ docType: "asc" }, { sort: "asc" }, { createdAt: "asc" }] });
}

export async function templatesFor(db: TenantDb, companyId: string, types: string[]) {
  const all = await ensureTemplates(db, companyId);
  return all.filter((t) => types.includes(t.docType)).sort((a, b) => types.indexOf(a.docType) - types.indexOf(b.docType) || Number(b.isDefault) - Number(a.isDefault) || a.sort - b.sort);
}

/** Вернуть бланку исходный вид из LiveSklad (или добавить недостающие исходные бланки). */
export async function restoreTemplates(db: TenantDb, companyId: string, onlyId?: string) {
  const all = await ensureTemplates(db, companyId);
  if (onlyId) {
    const t = all.find((x) => x.id === onlyId);
    const s = t?.source ? SEED_TEMPLATES.find((x) => x.source === t.source) : null;
    if (!t || !s) return false;
    await db.printTemplate.update({ where: { id: t.id }, data: { html: s.html, pageSize: s.pageSize, width: s.width, height: s.height, landscape: s.landscape, margins: s.margins } });
    return true;
  }
  const have = new Set(all.map((t) => t.source).filter(Boolean));
  const missing = SEED_TEMPLATES.filter((s) => !have.has(s.source));
  if (missing.length) await db.printTemplate.createMany({ data: missing.map((s) => seedData(companyId, s, false)) });
  return missing.length;
}

/** CSS-размер листа и полей для @page. */
export function pageCss(t: Pick<PrintTemplate, "pageSize" | "width" | "height" | "landscape" | "margins">) {
  let [w, h] = t.pageSize === "custom" && t.width && t.height ? [t.width, t.height] : (PAGE_SIZES[t.pageSize] ?? PAGE_SIZES.A4);
  if (t.landscape) [w, h] = [h, w];
  const m = [0, 1, 2, 3].map((i) => `${t.margins[i] ?? 10}mm`).join(" ");
  return { w, h, size: `${w}mm ${h}mm`, margin: m };
}

/** Список бланков для кнопки «Печать». */
export async function printMenu(db: TenantDb, companyId: string, kind: Parameters<typeof typesFor>[0], stockType?: string, preferNames: string[] = []) {
  const ts = await templatesFor(db, companyId, typesFor(kind, stockType));
  const templates = ts.map((t) => ({ id: t.id, name: t.name, group: docTypeLabel(t.docType) }));
  const byName = ts.filter((t) => preferNames.includes(t.name)).map((t) => t.id);
  const defaults = byName.length ? byName : ts.filter((t) => t.isDefault).slice(0, 1).map((t) => t.id);
  return { templates, defaults };
}
