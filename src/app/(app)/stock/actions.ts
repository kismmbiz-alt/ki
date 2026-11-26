"use server";

import { revalidatePath } from "next/cache";
import { requireLocation, requirePermission } from "@/lib/auth";
import { int, opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { createStockDoc, receiveStock, setStock, type DocInput } from "@/lib/domain/stock";
import { redirect } from "next/navigation";

const optKop = (fd: FormData, k: string) => (str(fd, k) ? toKop(fd.get(k)) : null);

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
    minQty: int(fd, "minQty"),
    groupId,
    supplierId,
  };
}

export const createProductAction = safe(async (fd) => {
  const ctx = await requirePermission("stock");
  const loc = requireLocation(ctx);
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название");
  const p = await ctx.db.product.create({
    data: { companyId: ctx.company.id, name, ...(await productFields(fd, ctx.db)) },
  });
  const qty = int(fd, "qty");
  if (qty > 0) {
    await receiveStock({ db: ctx.db, companyId: ctx.company.id }, { productId: p.id, locationId: loc.id, qty, cost: toKop(fd.get("cost")), userId: ctx.user.id });
  }
  revalidatePath("/stock");
  return `Товар «${name}» добавлен`;
});

export const updateProductAction = safe(async (fd) => {
  const ctx = await requirePermission("stock");
  const id = str(fd, "id");
  await ctx.db.product.update({
    where: { id },
    data: {
      name: str(fd, "name") || undefined,
      ...(await productFields(fd, ctx.db)),
      isActive: str(fd, "isActive") === "1",
    },
  });
  revalidatePath(`/stock/${id}`);
  return "Сохранено";
});

export const receiveAction = safe(async (fd) => {
  const ctx = await requirePermission("stock");
  const loc = requireLocation(ctx);
  const id = str(fd, "productId");
  await receiveStock(
    { db: ctx.db, companyId: ctx.company.id },
    { productId: id, locationId: loc.id, qty: int(fd, "qty"), cost: toKop(fd.get("cost")), userId: ctx.user.id, comment: opt(fd, "comment") ?? undefined },
  );
  revalidatePath(`/stock/${id}`);
  revalidatePath("/stock");
  return "Приход оформлен";
});

export const inventoryAction = safe(async (fd) => {
  const ctx = await requirePermission("stock");
  const loc = requireLocation(ctx);
  const id = str(fd, "productId");
  await setStock({ db: ctx.db, companyId: ctx.company.id }, { productId: id, locationId: loc.id, qty: int(fd, "qty"), userId: ctx.user.id });
  revalidatePath(`/stock/${id}`);
  return "Остаток исправлен";
});

export const saveGroupAction = safe(async (fd) => {
  const ctx = await requirePermission("stock");
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
    if (id) await ctx.db.productGroup.update({ where: { id }, data: { name, parentId: parentId === id ? null : parentId } });
    else await ctx.db.productGroup.create({ data: { companyId: ctx.company.id, name, parentId } });
  }
  revalidatePath("/stock");
  return "Сохранено";
});

export const saveSupplierAction = safe(async (fd) => {
  const ctx = await requirePermission("stock");
  const id = opt(fd, "id");
  const data = { name: str(fd, "name"), phone: opt(fd, "phone"), notes: opt(fd, "notes"), isActive: id ? str(fd, "isActive") === "1" : true };
  if (!data.name) throw new Error("Укажите название поставщика");
  if (id) await ctx.db.supplier.update({ where: { id }, data });
  else await ctx.db.supplier.create({ data: { companyId: ctx.company.id, ...data } });
  revalidatePath("/stock/suppliers");
  return "Сохранено";
});

export const stockDocAction = safe(async (fd) => {
  const ctx = await requirePermission("stock");
  const loc = requireLocation(ctx);
  const raw = JSON.parse(str(fd, "items") || "[]") as { productId: string; qty: string | number; cost?: string }[];
  const doc = await createStockDoc(
    { db: ctx.db, companyId: ctx.company.id },
    {
      type: str(fd, "type") as DocInput["type"],
      locationId: loc.id,
      toLocationId: opt(fd, "toLocationId"),
      supplierId: opt(fd, "supplierId"),
      userId: ctx.user.id,
      comment: opt(fd, "comment"),
      items: raw.map((r) => ({
        productId: String(r.productId),
        qty: Math.floor(Number(String(r.qty).replace(",", "."))),
        cost: r.cost !== undefined && String(r.cost).trim() !== "" ? toKop(r.cost) : undefined,
      })),
    },
  );
  revalidatePath("/stock");
  redirect(`/stock/docs/${doc.id}`);
});
