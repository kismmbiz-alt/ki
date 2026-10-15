"use server";

import { revalidatePath } from "next/cache";
import { requireLocation, requirePermission } from "@/lib/auth";
import { int, opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { receiveStock, setStock } from "@/lib/domain/stock";

export const createProductAction = safe(async (fd) => {
  const ctx = await requirePermission("stock");
  const loc = requireLocation(ctx);
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название");
  const p = await ctx.db.product.create({
    data: {
      companyId: ctx.company.id,
      name,
      sku: opt(fd, "sku"),
      barcode: opt(fd, "barcode"),
      price: toKop(fd.get("price")),
      minQty: int(fd, "minQty"),
    },
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
      name: str(fd, "name"),
      sku: opt(fd, "sku"),
      barcode: opt(fd, "barcode"),
      price: toKop(fd.get("price")),
      minQty: int(fd, "minQty"),
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
