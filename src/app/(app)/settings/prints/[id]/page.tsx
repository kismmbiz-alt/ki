import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { TemplateEditor } from "@/components/template-editor";
import { DOC_TYPES, PAGE_SIZES, pageCss } from "@/lib/print/templates";
import { FORMAT_HELP, varGroups } from "@/lib/print/vars";
import { ensurePriceTypes } from "@/lib/domain/prices";
import { SettingsTabs } from "../../tabs";
import { saveTemplateAction, templateOpAction } from "../../config-actions";

/** Пример документа для предпросмотра: последний заказ, продажа и т. п. */
async function sampleQuery(db: Awaited<ReturnType<typeof requirePermission>>["db"], docType: string, userId: string) {
  const stock: Record<string, string> = { receipt: "RECEIPT", supplier_return: "SUPPLIER_RETURN", writeoff: "WRITEOFF", transfer: "TRANSFER", inventory: "INVENTORY" };
  if (docType === "order" || docType === "invoice") {
    const o = await db.order.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
    return o && `order=${o.id}`;
  }
  if (docType === "sale") {
    const s = await db.sale.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
    return s && `sale=${s.id}`;
  }
  if (stock[docType]) {
    const d = await db.stockDoc.findFirst({ where: { type: stock[docType] as never }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return d && `doc=${d.id}`;
  }
  if (docType === "price_tag") {
    const p = await db.product.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return p && `products=${p.id}&qty=2`;
  }
  if (docType === "client_report") {
    const c = await db.client.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
    return c && `client=${c.id}`;
  }
  if (docType === "salary") return `salary=${userId}`;
  return null;
}

export default async function PrintEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company, user } = await requirePermission("settings");
  const t = await db.printTemplate.findUnique({ where: { id } });
  if (!t) notFound();
  const [types, sample] = await Promise.all([ensurePriceTypes(db, company.id), sampleQuery(db, t.docType, user.id)]);
  const groups = varGroups(t.docType, types.map((x) => x.name.replace(/\s+/g, "")));
  const pc = pageCss(t);
  return (
    <>
      <PageHeader title={`Бланк: ${t.name}`} back="/settings/prints">
        {sample && (
          <a href={`/print/t?tpl=${t.id}&${sample}`} target="_blank" className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Предпросмотр на примере
          </a>
        )}
      </PageHeader>
      <SettingsTabs admin />
      <Form action={saveTemplateAction} resetOnOk={false} className="space-y-4">
        <input type="hidden" name="id" value={t.id} />
        <Card title="Параметры">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Название" className="sm:col-span-2">
              <Input name="name" defaultValue={t.name} required />
            </Field>
            <Field label="Где печатается">
              <Select name="docType" defaultValue={t.docType}>
                {DOC_TYPES.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Порядок в списке">
              <Input name="sort" defaultValue={String(t.sort)} inputMode="numeric" />
            </Field>
            <Field label="Размер листа">
              <Select name="pageSize" defaultValue={t.pageSize}>
                {Object.keys(PAGE_SIZES).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
                <option value="custom">Свой размер (этикетка)</option>
              </Select>
            </Field>
            <Field label="Ширина, мм" hint="для своего размера">
              <Input name="width" defaultValue={t.width ? String(t.width) : ""} inputMode="numeric" />
            </Field>
            <Field label="Высота, мм" hint="для своего размера">
              <Input name="height" defaultValue={t.height ? String(t.height) : ""} inputMode="numeric" />
            </Field>
            <div className="flex flex-col justify-end gap-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="landscape" value="1" defaultChecked={t.landscape} /> альбомная
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="isDefault" value="1" defaultChecked={t.isDefault} /> печатать по умолчанию
              </label>
            </div>
            {(["mt", "mr", "mb", "ml"] as const).map((k, i) => (
              <Field key={k} label={`Поле ${["сверху", "справа", "снизу", "слева"][i]}, мм`}>
                <Input name={k} defaultValue={String(t.margins[i] ?? 10)} inputMode="numeric" />
              </Field>
            ))}
          </div>
        </Card>
        <Card title="Бланк">
          <TemplateEditor initial={t.html} groups={groups} widthMm={Math.max(40, pc.w - (t.margins[1] ?? 10) - (t.margins[3] ?? 10))} formats={FORMAT_HELP} />
        </Card>
        <div className="flex flex-wrap gap-2">
          <Submit>Сохранить бланк</Submit>
        </div>
      </Form>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <form action={templateOpAction}>
          <input type="hidden" name="id" value={t.id} />
          <button name="op" value="copy" className="text-blue-600 hover:underline">
            Сделать копию
          </button>
        </form>
        {t.source && (
          <form action={templateOpAction}>
            <input type="hidden" name="id" value={t.id} />
            <button name="op" value="restore" className="text-slate-600 hover:underline">
              Вернуть исходный вид из LiveSklad
            </button>
          </form>
        )}
        <form action={templateOpAction}>
          <input type="hidden" name="id" value={t.id} />
          <button name="op" value="delete" className="text-red-600 hover:underline">
            Удалить бланк
          </button>
        </form>
      </div>
    </>
  );
}
