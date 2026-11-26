"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ListingSourceKind, PayMethod } from "@prisma/client";
import { can, requireLocation, requirePermission, requireUser, type Ctx } from "@/lib/auth";
import { opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { addManualListing, buyListing, rejectListing, releaseListing, SUPPORTED_KINDS, takeListing } from "@/lib/domain/buyback";
import { collectSource } from "@/lib/collectors";
import { parseVkUrl } from "@/lib/collectors/vk";
import { parseTelegramUrl } from "@/lib/collectors/telegram";

const t = (ctx: Ctx) => ({ db: ctx.db, companyId: ctx.company.id });
const actor = (ctx: Ctx) => ({ userId: ctx.user.id, isAdmin: can(ctx.user.role, "buybackSources") });
const refresh = (id?: string) => {
  revalidatePath("/buyback");
  revalidatePath("/buyback/rating");
  if (id) revalidatePath(`/buyback/${id}`);
};

export const takeAction = safe(async (fd) => {
  const ctx = await requireUser();
  const id = str(fd, "id");
  await takeListing(t(ctx), id, ctx.user.id);
  refresh(id);
  return "Взято в работу — объявление теперь ваше";
});

export const releaseAction = safe(async (fd) => {
  const ctx = await requireUser();
  const id = str(fd, "id");
  await releaseListing(t(ctx), id, actor(ctx));
  refresh(id);
  return "Объявление вернулось в общую ленту";
});

export const rejectAction = safe(async (fd) => {
  const ctx = await requireUser();
  const id = str(fd, "id");
  await rejectListing(t(ctx), id, actor(ctx), str(fd, "reason"));
  refresh(id);
  return "Отмечено: не подошло";
});

export const buyAction = safe(async (fd) => {
  const ctx = await requireUser();
  const loc = requireLocation(ctx);
  const id = str(fd, "id");
  const sale = str(fd, "salePrice");
  await buyListing(t(ctx), {
    id,
    actor: actor(ctx),
    locationId: loc.id,
    buyPrice: toKop(fd.get("buyPrice")),
    productName: str(fd, "productName"),
    salePrice: sale ? toKop(sale) : undefined,
    method: (str(fd, "method") || "CASH") as PayMethod,
  });
  refresh(id);
  revalidatePath("/stock");
  return "Выкуп записан: техника на складе, расход в кассе, +1 в рейтинг";
});

export const addManualAction = safe(async (fd) => {
  const ctx = await requireUser();
  const price = str(fd, "price");
  const l = await addManualListing(t(ctx), {
    url: str(fd, "url"),
    title: str(fd, "title"),
    text: str(fd, "text"),
    price: price ? toKop(price) : null,
    userId: ctx.user.id,
    take: str(fd, "take") === "1",
  });
  refresh();
  redirect(`/buyback/${l.id}`);
});

// ---------- источники (владелец и администратор) ----------

/** Определяет площадку по ссылке и проверяет, что ссылку можно читать. */
function detectKind(url: string): ListingSourceKind {
  const u = url.toLowerCase();
  let kind: ListingSourceKind;
  if (/(^@|t\.me\/|telegram\.me\/)/.test(u)) kind = "TELEGRAM";
  else if (/vk\.(com|ru)\//.test(u)) kind = "VK";
  else if (u.includes("avito.ru")) kind = "AVITO";
  else if (u.includes("youla.ru")) kind = "YOULA";
  else throw new Error("Вставьте ссылку на группу ВКонтакте (vk.com/…) или Telegram-канал (t.me/…)");
  if (!SUPPORTED_KINDS.includes(kind)) throw new Error("Авито и Юлу подключим на следующем этапе");
  if (kind === "VK") parseVkUrl(url);
  if (kind === "TELEGRAM") parseTelegramUrl(url);
  return kind;
}

export const createSourceAction = safe(async (fd) => {
  const ctx = await requirePermission("buybackSources");
  const url = str(fd, "url");
  const kind = detectKind(url);
  const s = await ctx.db.listingSource.create({
    data: {
      companyId: ctx.company.id,
      kind,
      url,
      name: str(fd, "name") || url.replace(/^https?:\/\//, ""),
      keywords: str(fd, "keywords"),
      stopWords: str(fd, "stopWords"),
    },
  });
  const r = await collectSource(s);
  revalidatePath("/buyback/sources");
  refresh();
  return r.error ? `Источник добавлен, но проверка не удалась: ${r.error}` : `Источник добавлен. Новых объявлений: ${r.found}`;
});

export const updateSourceAction = safe(async (fd) => {
  const ctx = await requirePermission("buybackSources");
  const id = str(fd, "id");
  await ctx.db.listingSource.update({
    where: { id },
    data: {
      name: str(fd, "name"),
      keywords: str(fd, "keywords"),
      stopWords: str(fd, "stopWords"),
      isActive: str(fd, "isActive") === "1",
    },
  });
  revalidatePath("/buyback/sources");
  return "Сохранено";
});

export const checkSourceAction = safe(async (fd) => {
  const ctx = await requirePermission("buybackSources");
  const s = await ctx.db.listingSource.findUniqueOrThrow({ where: { id: str(fd, "id") } });
  const r = await collectSource(s);
  revalidatePath("/buyback/sources");
  refresh();
  if (r.error) throw new Error(r.error);
  return `Проверено. Новых объявлений: ${r.found}`;
});

export const deleteSourceAction = safe(async (fd) => {
  const ctx = await requirePermission("buybackSources");
  const id = str(fd, "id");
  await ctx.db.$transaction(async (tx) => {
    // уже найденные объявления остаются в ленте, просто без источника
    await tx.listing.updateMany({ where: { sourceId: id }, data: { sourceId: null } });
    await tx.listingSource.delete({ where: { id } });
  });
  revalidatePath("/buyback/sources");
  refresh();
  return opt(fd, "name") ? `Источник «${opt(fd, "name")}» удалён` : "Источник удалён";
});
