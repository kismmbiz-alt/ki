import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { renderTemplate, type PrintCtx } from "@/lib/print/engine";
import { clientReportCtx, orderCtx, priceTagCtxs, saleCtx, salaryCtx, stockDocCtx } from "@/lib/print/data";
import { ensureTemplates, pageCss, typesFor } from "@/lib/print/templates";
import { salarySheet } from "@/lib/domain/salary";

type SP = Record<string, string | undefined>;
const list = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const day = (s: string | undefined, fallback: Date) => {
  const d = s ? new Date(`${s}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : fallback;
};

const BASE_CSS = `
body{margin:0;background:#e5e7eb}
.sheet{background:#fff;color:#000;font:10pt Arial,Helvetica,sans-serif;line-height:1.25;box-sizing:border-box;margin:12px auto;box-shadow:0 1px 4px rgba(0,0,0,.15);overflow:hidden}
.sheet p{margin:0;min-height:1em}
.sheet h1{font-size:16pt;margin:0 0 4px}.sheet h2{font-size:14pt;margin:0 0 4px}.sheet h3{font-size:12pt;margin:0 0 4px}
.sheet hr{border:0;border-top:1px solid #000;margin:4px 0}
.sheet table{border-collapse:collapse;width:100%}
.sheet td,.sheet th{border:1px solid #000;padding:1px 4px;vertical-align:top}
.sheet td.nb,.sheet th.nb{border:none}
.sheet ol,.sheet ul{margin:2px 0;padding-left:18px}
.tags{display:flex;flex-wrap:wrap;gap:2mm;align-content:flex-start}
.tag{display:inline-block;border:1px dashed #999;padding:1mm;box-sizing:border-box}
@media print{body{background:#fff}.sheet{margin:0;box-shadow:none}.no-print{display:none!important}.brk{break-after:page}}
`;

export default async function PrintTemplates({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db, company, user } = await requireUser();
  const all = await ensureTemplates(db, company.id);

  // откуда печатаем — из этого же решаем, какие бланки подходят
  let kind: Parameters<typeof typesFor>[0] | null = null;
  let stockType: string | undefined;
  if (sp.order) kind = "order";
  else if (sp.sale) kind = "sale";
  else if (sp.doc) {
    kind = "stock";
    stockType = (await db.stockDoc.findUnique({ where: { id: sp.doc }, select: { type: true } }))?.type;
  } else if (sp.products) kind = "product";
  else if (sp.client) kind = "client";
  else if (sp.salary) kind = "salary";
  if (!kind) notFound();
  const types = typesFor(kind, stockType);
  const ids = list(sp.tpl);
  const tpls = ids.length ? ids.map((id) => all.find((t) => t.id === id)).filter((t) => !!t) : all.filter((t) => types.includes(t.docType) && t.isDefault).slice(0, 1);
  if (!tpls.length) notFound();

  // данные
  let ctxs: PrintCtx[] = [];
  if (kind === "order") {
    const o = await db.order.findUnique({ where: { id: sp.order! }, select: { masterId: true } });
    if (!o || (!can(user, "allOrders") && o.masterId !== user.id)) notFound();
    const c = await orderCtx(db, company, user, sp.order!);
    if (c) ctxs = [c];
  } else if (kind === "sale") {
    if (!can(user, "sales")) notFound();
    const c = await saleCtx(db, company, user, sp.sale!);
    if (c) ctxs = [c];
  } else if (kind === "stock") {
    if (!can(user, "stock")) notFound();
    const c = await stockDocCtx(db, company, user, sp.doc!);
    if (c) ctxs = [c];
  } else if (kind === "product") {
    if (!can(user, "stock") && !can(user, "sales")) notFound();
    const pids = list(sp.products);
    const qty = list(sp.qty).map(Number);
    const counts = Object.fromEntries(pids.map((id, i) => [id, Number.isFinite(qty[i]) && qty[i] > 0 ? qty[i] : 1]));
    ctxs = await priceTagCtxs(db, company, user, pids, counts);
  } else if (kind === "client") {
    const now = new Date();
    const from = day(sp.from, new Date(now.getFullYear(), 0, 1));
    const to = new Date(day(sp.to, now).getTime() + 86400000);
    const c = await clientReportCtx(db, company, user, sp.client!, from, to);
    if (c) ctxs = [c];
  } else if (kind === "salary") {
    if (!can(user, "cash") && sp.salary !== user.id) notFound();
    const now = new Date();
    const from = day(sp.from, new Date(now.getFullYear(), now.getMonth(), 1));
    const to = new Date(day(sp.to, new Date(from.getFullYear(), from.getMonth() + 1, 0)).getTime() + 86400000);
    const sheet = await salarySheet(db, company, sp.salary!, from, to);
    const rows = sheet
      ? [
          { label: "Оклад", amount: sheet.salary },
          { label: "Начисления за продажи и работы", amount: sheet.accrued },
          { label: "Бонусы", amount: sheet.bonus },
          { label: "Штрафы", amount: -sheet.fine },
          { label: "Выплачено", amount: -sheet.paid },
        ]
      : [];
    const payout = sp.amount ? Math.round(Number(sp.amount) * 100) : (sheet?.due ?? 0);
    const c = await salaryCtx(db, company, user, { userId: sp.salary!, from, to, rows, payout, comment: sp.comment });
    if (c) ctxs = [c];
  }
  if (!ctxs.length) notFound();

  const css: string[] = [];
  const sheets: string[] = [];
  tpls.forEach((t, i) => {
    const pc = pageCss(t);
    const scope = `t${i}`;
    const name = `p${i}`;
    css.push(`@page ${name}{size:${pc.size};margin:0}.${scope}{page:${name};width:${pc.w}mm;min-height:${pc.h}mm;padding:${pc.margin}}`);
    if (kind === "product" && t.pageSize === "custom") {
      // этикетка своего размера — каждая на своём «листе» (под термопринтер)
      for (const c of ctxs) sheets.push(`<div class="sheet ${scope} {brk}" style="height:${pc.h}mm;min-height:0">${renderTemplate(t.html, c, scope)}</div>`);
    } else if (kind === "product") {
      sheets.push(`<div class="sheet ${scope} {brk}"><div class="tags">${ctxs.map((c) => `<div class="tag">${renderTemplate(t.html, c, scope)}</div>`).join("")}</div></div>`);
    } else {
      for (const c of ctxs) sheets.push(`<div class="sheet ${scope} {brk}">${renderTemplate(t.html, c, scope)}</div>`);
    }
  });
  const html = sheets.map((s, i) => s.replace("{brk}", i < sheets.length - 1 ? "brk" : "")).join("");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BASE_CSS + css.join("\n") }} />
      <div className="no-print flex items-center justify-center gap-3 bg-white p-3 text-sm shadow">
        <span className="text-slate-600">{tpls.map((t) => t.name).join(" + ")}</span>
        <PrintButton />
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
