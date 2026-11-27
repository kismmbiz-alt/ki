"use server";

import { revalidatePath } from "next/cache";
import { can, requireLocation, requirePermission } from "@/lib/auth";
import { int, opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { createStockDoc, payStockDoc, receiveStock, setStock, type DocInput } from "@/lib/domain/stock";
import { normalizePhone } from "@/lib/domain/orders";
import { redirect } from "next/navigation";
import { saveProductPrices } from "@/lib/domain/prices";
import { nextBarcode } from "@/lib/domain/barcodes";
import { canNest } from "@/lib/domain/groups";
import { markupPrice, type PriceField } from "@/lib/domain/markup";

const optKop = (fd: FormData, k: string) => (str(fd, k) ? toKop(fd.get(k)) : null);

/** Свои виды цен из полей pt_<id>. */
function customPrices(fd: FormData) {
  const out: Record<string, number | null> = {};
  for (const [k] of fd.entries()) if (k.startsWith("pt_")) out[k.slice(3)] = optKop(fd, k);
  return out;
}

async function productFields(fd: FormData, db: Awaited<ReturnType<typeof requirePermission>>["db"]) {
  const groupId = opt(fd, "groupId");
  const supplierId = opt(fd, "supplierId");
  if (groupId) await db.productGroup.findUniqueOrThrow({ where: { id: groupId } });
  if (supplierId) await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  return {
    sku: opt(fd, "sku"),
    barcode: opt(fd, "barcode"),
    price: toKop(fd.get("price")),
    repairPrice: optKop(fd, "repairPrice"),
    minPrice: optKop(fd, "minPrice"),
    ...(str(fd, "cost") ? { cost: toKop(fd.get("cost")) } : {}),
    minQty: int(fd, "minQty"),
    article: opt(fd, "article"),
    unit: str(fd, "unit") || "шт",
    warrantyDays: str(fd, "warrantyDays") ? int(fd, "warrantyDays") : null,
    country: opt(fd, "country"),
    description: opt(fd, "description"),
    isSerial: str(fd, "isSerial") === "1",
    groupId,
    supplierId,
  };
}

export const createProductAction = safe(async (fd) => {
  const ctx = await requirePermission("stockDocs");
  const loc = requireLocation(ctx);
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название");
  const fields = await productFields(fd, ctx.db);
  const p = await ctx.db.product.create({
    data: { companyId: ctx.company.id, name, ...fields, barcode: fields.barcode ?? (await nextBarcode(ctx.company.id)) },
  });
  await saveProductPrices(ctx.db, ctx.company.id, p.id, customPrices(fd));
  const qty = int(fd, "qty");
  if (qty > 0) {
    await receiveStock({ db: ctx.db, companyId: ctx.company.id }, { productId: p.id, locationId: loc.id, warehouseId: opt(fd, "warehouseId"), qty, cost: toKop(fd.get("cost")), userId: ctx.user.id });
  }
  revalidatePath("/stock");
  return `Товар «${name}» добавлен`;
});

export const updateProductAction = safe(async (fd) => {
  const ctx = await requirePermission("stockDocs");
  const id = str(fd, "id");
  await ctx.db.product.update({
    where: { id },
    data: {
      name: str(fd, "name") || undefined,
      ...(await productFields(fd, ctx.db)),
      isActive: str(fd, "isActive") === "1",
    },
  });
  await saveProductPrices(ctx.db, ctx.company.id, id, customPrices(fd));
  revalidatePath(`/stock/${id}`);
  return "Сохранено";
});

export const receiveAction = safe(async (fd) => {
  const ctx = await requirePermission("stockDocs");
  const loc = requireLocation(ctx);
  const id = str(fd, "productId");
  await receiveStock(
    { db: ctx.db, companyId: ctx.company.id },
    { productId: id, locationId: loc.id, warehouseId: opt(fd, "warehouseId"), qty: int(fd, "qty"), cost: toKop(fd.get("cost")), userId: ctx.user.id, comment: opt(fd, "comment") ?? undefined },
  );
  revalidatePath(`/stock/${id}`);
  revalidatePath("/stock");
  return "Приход оформлен";
});

export const inventoryAction = safe(async (fd) => {
  const ctx = await requirePermission("stockDocs");
  const loc = requireLocation(ctx);
  const id = str(fd, "productId");
  await setStock({ db: ctx.db, companyId: ctx.company.id }, { productId: id, locationId: loc.id, warehouseId: opt(fd, "warehouseId"), qty: int(fd, "qty"), userId: ctx.user.id });
  revalidatePath(`/stock/${id}`);
  return "Остаток исправлен";
});

export const saveGroupAction = safe(async (fd) => {
  const ctx = await requirePermission("stockDocs");
  const name = str(fd, "name");
  const id = opt(fd, "id");
  const parentId = opt(fd, "parentId");
  if (parentId) await ctx.db.productGroup.findUniqueOrThrow({ where: { id: parentId } });
  if (id && str(fd, "delete") === "1") {
    const used = await ctx.db.product.count({ where: { groupId: id } });
    const kids = await ctx.db.productGroup.count({ where: { parentId: id } });
    if (used || kids) throw new Error("В группе есть товары или подгруппы");
    await ctx.db.productGroup.delete({ where: { id } });
  } else {
    if (!name) throw new Error("Укажите название группы");
    if (id && !canNest(await ctx.db.productGroup.findMany({ select: { id: true, name: true, parentId: true } }), id, parentId)) throw new Error("Нельзя вложить группу саму в себя или в свою подгруппу");
    if (id) await ctx.db.productGroup.update({ where: { id }, data: { name, parentId } });
    else await ctx.db.productGroup.create({ data: { companyId: ctx.company.id, name, parentId } });
  }
  revalidatePath("/stock");
  return "Сохранено";
});

export const saveSupplierAction = safe(async (fd) => {
  const ctx = await requirePermission("stockDocs");
  const id = opt(fd, "id");
  const data = { name: str(fd, "name"), phone: opt(fd, "phone"), notes: opt(fd, "notes"), isActive: id ? str(fd, "isActive") === "1" : true };
  if (!data.name) throw new Error("Укажите название поставщика");
  if (id) await ctx.db.supplier.update({ where: { id }, data });
  else await ctx.db.supplier.create({ data: { companyId: ctx.company.id, ...data } });
  revalidatePath("/stock/suppliers");
  return "Сохранено";
});

const kopOrNull = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : toKop(String(v)));

type RawItem = {
  productId?: string;
  qty: string | number;
  cost?: string;
  price?: string;
  repairPrice?: string;
  minPrice?: string;
  newProduct?: { name: string; groupId?: string; sku?: string; article?: string; barcode?: string; unit?: string; warrantyDays?: string; country?: string; description?: string; isSerial?: boolean };
};

export const stockDocAction = safe(async (fd) => {
  const ctx = await requirePermission("stockDocs");
  const loc = requireLocation(ctx);
  const t = { db: ctx.db, companyId: ctx.company.id };
  const type = str(fd, "type") as DocInput["type"];
  const raw = JSON.parse(str(fd, "items") || "[]") as RawItem[];

  // от кого поступил товар: поставщик (можно сразу завести нового) или клиент
  let supplierId = opt(fd, "supplierId");
  let clientId: string | null = null;
  const source = str(fd, "source") || "supplier";
  if (type === "RECEIPT" && source === "client") {
    supplierId = null;
    const phone = normalizePhone(str(fd, "clientPhone"));
    const name = str(fd, "clientName");
    if (!phone) throw new Error("Укажите телефон клиента");
    const found = await ctx.db.client.findFirst({ where: { phone } });
    clientId = found?.id ?? (await ctx.db.client.create({ data: { companyId: ctx.company.id, name: name || "Клиент", phone } })).id;
  } else if (type === "RECEIPT" && !supplierId && str(fd, "newSupplier")) {
    const name = str(fd, "newSupplier");
    const ex = await ctx.db.supplier.findFirst({ where: { name } });
    supplierId = ex?.id ?? (await ctx.db.supplier.create({ data: { companyId: ctx.company.id, name } })).id;
  }

  const inDate = str(fd, "inDocDate");
  const doc = await createStockDoc(t, {
    type,
    locationId: loc.id,
    warehouseId: opt(fd, "warehouseId"),
    toWarehouseId: opt(fd, "toWarehouseId"),
    supplierId,
    clientId,
    userId: ctx.user.id,
    responsibleId: opt(fd, "responsibleId"),
    inDocNo: opt(fd, "inDocNo"),
    inDocDate: inDate ? new Date(`${inDate}T00:00:00`) : null,
    comment: opt(fd, "comment"),
    items: raw.map((r) => ({
      productId: r.productId ? String(r.productId) : undefined,
      newProduct: r.newProduct
        ? {
            ...r.newProduct,
            groupId: r.newProduct.groupId || null,
            warrantyDays: r.newProduct.warrantyDays ? Math.max(0, Math.floor(Number(r.newProduct.warrantyDays))) || null : null,
          }
        : undefined,
      qty: Math.floor(Number(String(r.qty).replace(",", "."))),
      cost: r.cost !== undefined && String(r.cost).trim() !== "" ? toKop(r.cost) : undefined,
      price: kopOrNull(r.price),
      repairPrice: kopOrNull(r.repairPrice),
      minPrice: kopOrNull(r.minPrice),
    })),
  });

  // оплата сразу при поступлении
  const pay = str(fd, "payAmount") ? toKop(fd.get("payAmount")) : 0;
  let payErr = "";
  if (type === "RECEIPT" && pay > 0) {
    try {
      if (!can(ctx.user, "cashOps")) throw new Error("нет права записывать расходы из кассы");
      await payStockDoc(t, { docId: doc.id, userId: ctx.user.id, amount: Math.min(pay, doc.total), cashboxId: opt(fd, "cashboxId"), method: (str(fd, "method") || "CASH") as "CASH" });
    } catch (e) {
      payErr = e instanceof Error ? e.message : "ошибка";
    }
  }
  revalidatePath("/stock", "layout");
  redirect(`/stock/docs/${doc.id}${payErr ? `?payErr=${encodeURIComponent(payErr)}` : ""}`);
});

/** Оплата поступления (полностью или частями). */
export const payStockDocAction = safe(async (fd) => {
  const ctx = await requirePermission("stockDocs");
  if (!can(ctx.user, "cashOps")) throw new Error("Нет права записывать расходы из кассы");
  const docId = str(fd, "docId");
  await payStockDoc({ db: ctx.db, companyId: ctx.company.id }, { docId, userId: ctx.user.id, amount: toKop(fd.get("amount")), cashboxId: opt(fd, "cashboxId"), method: (str(fd, "method") || "CASH") as "CASH" });
  revalidatePath(`/stock/docs/${docId}`);
  return "Оплата записана";
});

const PRICE_FIELDS: PriceField[] = ["cost", "price", "repairPrice", "minPrice"];

/** Действия с отмеченными товарами на складе: наценка, изменение полей, архив. */
export const bulkProductsAction = safe(async (fd) => {
  const ctx = await requirePermission("stockDocs");
  const ids = fd.getAll("products").map(String).filter(Boolean);
  if (!ids.length) throw new Error("Отметьте товары галочками");
  const op = str(fd, "op");
  const products = await ctx.db.product.findMany({ where: { id: { in: ids } } });
  if (op === "markup") {
    const from = str(fd, "from") as PriceField;
    const to = str(fd, "to") as PriceField;
    if (!PRICE_FIELDS.includes(from) || !PRICE_FIELDS.includes(to) || to === "cost") throw new Error("Выберите цены");
    const pct = Number(String(fd.get("pct") ?? "").replace(",", ".")) || 0;
    const add = str(fd, "add") ? toKop(fd.get("add")) : 0;
    const round = str(fd, "round") ? toKop(fd.get("round")) : 0;
    let n = 0;
    for (const p of products) {
      const base = p[from];
      if (base == null || base <= 0) continue;
      await ctx.db.product.update({ where: { id: p.id }, data: { [to]: markupPrice(base, pct, add, round) } });
      n++;
    }
    revalidatePath("/stock");
    return `Цена изменена у ${n} товаров`;
  }
  if (op === "edit") {
    const data: Record<string, unknown> = {};
    const g = str(fd, "setGroup");
    if (g) {
      if (g !== "none") await ctx.db.productGroup.findUniqueOrThrow({ where: { id: g } });
      data.groupId = g === "none" ? null : g;
    }
    const sup = str(fd, "setSupplier");
    if (sup) {
      if (sup !== "none") await ctx.db.supplier.findUniqueOrThrow({ where: { id: sup } });
      data.supplierId = sup === "none" ? null : sup;
    }
    if (str(fd, "setMinQty")) data.minQty = int(fd, "setMinQty");
    for (const f of ["price", "repairPrice", "minPrice"] as const) if (str(fd, `set_${f}`)) data[f] = toKop(fd.get(`set_${f}`));
    if (!Object.keys(data).length) throw new Error("Укажите, что изменить");
    await ctx.db.product.updateMany({ where: { id: { in: products.map((p) => p.id) } }, data });
    revalidatePath("/stock");
    return `Изменено товаров: ${products.length}`;
  }
  if (op === "archive" || op === "unarchive") {
    await ctx.db.product.updateMany({ where: { id: { in: products.map((p) => p.id) } }, data: { isActive: op === "unarchive" } });
    revalidatePath("/stock");
    return op === "archive" ? `В архив: ${products.length}` : `Из архива: ${products.length}`;
  }
  throw new Error("Неизвестное действие");
});
