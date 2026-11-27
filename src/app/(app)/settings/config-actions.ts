"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PayMethod, StatusKind } from "@prisma/client";
import { hashPassword, requirePermission, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { int, opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { logAction } from "@/lib/domain/log";
import { addCashTransaction } from "@/lib/domain/cash";
import { isBuiltin } from "@/lib/domain/prices";
import { fillMissingBarcodes } from "@/lib/domain/barcodes";
import { DOC_TYPES, PAGE_SIZES, restoreTemplates } from "@/lib/print/templates";

const yes = (fd: FormData, k: string) => str(fd, k) === "1" || str(fd, k) === "on";
const dateOf = (s: string) => {
  const d = s ? new Date(`${s}T12:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

// ---- виды цен ----
export const savePriceTypeAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = opt(fd, "id");
  if (id && str(fd, "delete") === "1") {
    await ctx.db.productPrice.deleteMany({ where: { priceTypeId: id } });
    await ctx.db.priceType.delete({ where: { id } });
    if (ctx.company.salePriceKey === id || ctx.company.orderPriceKey === id)
      await prisma.company.update({ where: { id: ctx.company.id }, data: { salePriceKey: ctx.company.salePriceKey === id ? "retail" : undefined, orderPriceKey: ctx.company.orderPriceKey === id ? "repair" : undefined } });
    revalidatePath("/settings/prices");
    return "Цена удалена";
  }
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название цены");
  const data = { name, forProducts: yes(fd, "forProducts"), forWorks: yes(fd, "forWorks"), sort: int(fd, "sort") };
  if (id) await ctx.db.priceType.update({ where: { id }, data });
  else await ctx.db.priceType.create({ data: { ...data, companyId: ctx.company.id } });
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "settings", text: `${id ? "Изменена" : "Добавлена"} цена «${name}»` });
  revalidatePath("/settings/prices");
  return "Сохранено";
});

export const savePriceDefaultsAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const ok = async (k: string) => isBuiltin(k) || !!(await ctx.db.priceType.findUnique({ where: { id: k } }));
  const sale = str(fd, "salePriceKey") || "retail";
  const order = str(fd, "orderPriceKey") || "repair";
  if (!(await ok(sale)) || !(await ok(order))) throw new Error("Неизвестная цена");
  await prisma.company.update({ where: { id: ctx.company.id }, data: { salePriceKey: sale, orderPriceKey: order, hideMinPrice: yes(fd, "hideMinPrice") } });
  revalidatePath("/", "layout");
  return "Сохранено";
});

/** Выдать штрихкоды всем товарам без штрихкода. */
export const fillBarcodesAction = safe(async () => {
  const ctx = await requirePermission("settings");
  const n = await fillMissingBarcodes(ctx.company.id);
  revalidatePath("/stock");
  return n ? `Штрихкоды выданы: ${n} товаров` : "У всех товаров уже есть штрихкод";
});

// ---- печатные формы ----
export const saveTemplateAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = str(fd, "id");
  const docType = str(fd, "docType");
  if (!DOC_TYPES.some((d) => d.key === docType)) throw new Error("Выберите вид документа");
  const pageSize = str(fd, "pageSize");
  if (pageSize !== "custom" && !PAGE_SIZES[pageSize]) throw new Error("Неизвестный размер листа");
  const w = int(fd, "width", 0);
  const h = int(fd, "height", 0);
  if (pageSize === "custom" && (w < 10 || h < 10 || w > 1000 || h > 1000)) throw new Error("Укажите ширину и высоту листа в мм (от 10 до 1000)");
  const html = String(fd.get("html") ?? "");
  if (html.length > 400_000) throw new Error("Бланк слишком большой");
  const margins = ["mt", "mr", "mb", "ml"].map((k) => Math.max(0, Math.min(50, int(fd, k, 10))));
  const isDefault = yes(fd, "isDefault");
  const data = {
    name: str(fd, "name") || "Без названия",
    docType,
    pageSize,
    width: pageSize === "custom" ? w : null,
    height: pageSize === "custom" ? h : null,
    landscape: yes(fd, "landscape"),
    separate: yes(fd, "separate"),
    margins,
    html,
    isDefault,
    sort: int(fd, "sort"),
  };
  if (isDefault) await ctx.db.printTemplate.updateMany({ where: { docType, NOT: { id } }, data: { isDefault: false } });
  await ctx.db.printTemplate.update({ where: { id }, data });
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "settings", text: `Изменён бланк «${data.name}»` });
  revalidatePath("/settings/prints");
  return "Бланк сохранён";
});

export async function templateOpAction(fd: FormData) {
  const ctx = await requirePermission("settings");
  const id = str(fd, "id");
  const op = str(fd, "op");
  if (op === "new") {
    const docType = DOC_TYPES.some((d) => d.key === str(fd, "docType")) ? str(fd, "docType") : "order";
    const t = await ctx.db.printTemplate.create({ data: { companyId: ctx.company.id, docType, name: "Новый бланк", html: "<h2>&lt;НазваниеКомпании&gt;</h2><p>Документ № &lt;НомерДокумента&gt; от &lt;ДатаДокумента&gt;</p>", sort: 99 } });
    redirect(`/settings/prints/${t.id}`);
  }
  const t = await ctx.db.printTemplate.findUniqueOrThrow({ where: { id } });
  if (op === "copy") {
    const { id: _id, createdAt: _c, updatedAt: _u, companyId: _co, ...rest } = t;
    const c = await ctx.db.printTemplate.create({ data: { ...rest, companyId: ctx.company.id, name: `${t.name} (копия)`, isDefault: false, source: null } });
    redirect(`/settings/prints/${c.id}`);
  }
  if (op === "delete") {
    await ctx.db.printTemplate.delete({ where: { id } });
    await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "settings", text: `Удалён бланк «${t.name}»` });
    redirect("/settings/prints");
  }
  if (op === "restore") {
    await restoreTemplates(ctx.db, ctx.company.id, id);
    revalidatePath(`/settings/prints/${id}`);
    redirect(`/settings/prints/${id}`);
  }
}

export const restoreAllTemplatesAction = safe(async () => {
  const ctx = await requirePermission("settings");
  const n = await restoreTemplates(ctx.db, ctx.company.id);
  revalidatePath("/settings/prints");
  return n ? `Добавлено бланков: ${n}` : "Все бланки LiveSklad уже есть";
});

// ---- статусы ----
const KINDS: StatusKind[] = ["NEW", "IN_PROGRESS", "WAITING", "READY", "CLOSED", "CANCELED"];

export const saveStatusFullAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = opt(fd, "id");
  const kind = str(fd, "kind") as StatusKind;
  if (!KINDS.includes(kind)) throw new Error("Неверный тип статуса");
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название");
  const ids = (k: string) => fd.getAll(k).map(String).filter(Boolean);
  if (id && str(fd, "delete") === "1") {
    if (await ctx.db.order.count({ where: { statusId: id } })) throw new Error("В этом статусе есть заказы — сначала переведите их в другой статус");
    await ctx.db.orderStatus.delete({ where: { id } });
    revalidatePath("/settings/statuses");
    return "Статус удалён";
  }
  const deadline = int(fd, "deadlineHours", 0);
  const data = {
    name,
    kind,
    color: str(fd, "color") || "#64748b",
    widgetName: opt(fd, "widgetName"),
    comment: opt(fd, "comment"),
    requirePayment: yes(fd, "requirePayment"),
    requireMaster: yes(fd, "requireMaster"),
    deadlineHours: deadline > 0 ? deadline : null,
    nextIds: ids("nextIds"),
    denySet: ids("denySet"),
    denySee: ids("denySee"),
    denyEdit: ids("denyEdit"),
  };
  if (id) await ctx.db.orderStatus.update({ where: { id }, data });
  else {
    const last = await ctx.db.orderStatus.findFirst({ orderBy: { sort: "desc" } });
    await ctx.db.orderStatus.create({ data: { ...data, companyId: ctx.company.id, sort: (last?.sort ?? 0) + 1 } });
  }
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "settings", text: `${id ? "Изменён" : "Добавлен"} статус «${name}»` });
  revalidatePath("/settings/statuses");
  return "Сохранено";
});

/** Поднять/опустить статус в списке. */
export async function moveStatusAction(fd: FormData) {
  const ctx = await requirePermission("settings");
  const id = str(fd, "id");
  const dir = str(fd, "dir") === "up" ? -1 : 1;
  const list = await ctx.db.orderStatus.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] });
  const i = list.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  for (let n = 0; n < list.length; n++) if (list[n].sort !== n) await ctx.db.orderStatus.update({ where: { id: list[n].id }, data: { sort: n } });
  revalidatePath("/settings/statuses");
}

export const saveStatusChainsAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  await prisma.company.update({ where: { id: ctx.company.id }, data: { statusChains: yes(fd, "statusChains") } });
  revalidatePath("/settings/statuses");
  return "Сохранено";
});

// ---- сотрудник: полная карточка ----
export const saveEmployeeAction = safe(async (fd) => {
  const ctx = await requirePermission("users");
  const id = str(fd, "id");
  const target = await ctx.db.user.findUniqueOrThrow({ where: { id } });
  if (target.role === "OWNER" && ctx.user.role !== "OWNER") throw new Error("Владельца может менять только владелец");
  const lastName = opt(fd, "lastName");
  const firstName = opt(fd, "firstName");
  const middleName = opt(fd, "middleName");
  const name = [lastName, firstName, middleName].filter(Boolean).join(" ") || str(fd, "name") || target.name;
  const email = str(fd, "email").toLowerCase();
  if (email && email !== target.email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Неверный email");
    if (await prisma.user.findUnique({ where: { email } })) throw new Error("Этот email уже используется");
  }
  const warehouseIds = fd.getAll("warehouseIds").map(String).filter(Boolean);
  const cashboxIds = fd.getAll("cashboxIds").map(String).filter(Boolean);
  const defaultCashboxId = opt(fd, "defaultCashboxId");
  if (defaultCashboxId && cashboxIds.length && !cashboxIds.includes(defaultCashboxId)) throw new Error("Касса по умолчанию должна быть среди доступных касс");
  const autoLogout = int(fd, "autoLogoutDays", 0);
  const data: Parameters<typeof ctx.db.user.update>[0]["data"] = {
    name,
    lastName,
    firstName,
    middleName,
    email: email || target.email,
    phone: opt(fd, "phone"),
    jobTitle: opt(fd, "jobTitle"),
    cashierInn: opt(fd, "cashierInn"),
    telegram: opt(fd, "telegram"),
    birthDate: dateOf(str(fd, "birthDate")),
    address: opt(fd, "address"),
    note: opt(fd, "note"),
    autoLogoutDays: autoLogout > 0 ? autoLogout : null,
    locationId: opt(fd, "locationId"),
    warehouseIds,
    cashboxIds,
    defaultCashboxId,
    baseSalary: toKop(fd.get("baseSalary")),
    salaryPercent: int(fd, "salaryPercent"),
  };
  if (target.role !== "OWNER") {
    const posId = str(fd, "positionId");
    const pos = await ctx.db.position.findUniqueOrThrow({ where: { id: posId } });
    if (target.id === ctx.user.id && pos.id !== target.positionId) throw new Error("Свою должность может поменять только владелец или другой администратор");
    data.role = pos.baseRole;
    data.positionId = pos.id;
    if (target.id !== ctx.user.id) data.isActive = yes(fd, "isActive");
  }
  const password = str(fd, "password");
  if (password) {
    if (password.length < 8) throw new Error("Пароль не короче 8 символов");
    data.passwordHash = await hashPassword(password);
  }
  await ctx.db.user.update({ where: { id }, data });
  if (data.isActive === false || password || (email && email !== target.email)) await prisma.session.deleteMany({ where: { userId: id } });
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "users", text: `Изменена карточка сотрудника «${name}»${password ? ", новый пароль" : ""}${data.isActive === false ? ", отключён" : ""}` });
  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${id}`);
  return "Сохранено";
});

// ---- правила зарплаты ----
export const saveSalaryRuleAction = safe(async (fd) => {
  const ctx = await requirePermission("users");
  const id = opt(fd, "id");
  const userId = str(fd, "userId");
  await ctx.db.user.findUniqueOrThrow({ where: { id: userId } });
  if (id && str(fd, "delete") === "1") {
    await ctx.db.salaryRule.delete({ where: { id } });
    revalidatePath(`/settings/users/${userId}`);
    return "Правило удалено";
  }
  const kind = str(fd, "kind") === "SALE" ? "SALE" : "WORK";
  const pct = Number(str(fd, "percent").replace(",", ".") || "0");
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("Процент от 0 до 100");
  const max = str(fd, "maxAmount");
  const data = {
    userId,
    kind,
    base: str(fd, "base") === "REVENUE" ? "REVENUE" : "PROFIT",
    percent: Math.round(pct * 100),
    fixed: toKop(fd.get("fixed")),
    minBase: toKop(fd.get("minBase")),
    maxAmount: max ? toKop(max) : null,
    locationId: opt(fd, "locationId"),
    orderType: kind === "WORK" ? opt(fd, "orderType") : null,
    includeWorks: yes(fd, "includeWorks"),
    includeParts: yes(fd, "includeParts"),
    subtractNegative: yes(fd, "subtractNegative"),
    keepOnReturn: yes(fd, "keepOnReturn"),
  };
  if (!data.percent && !data.fixed) throw new Error("Укажите процент или фиксированную сумму");
  if (id) await ctx.db.salaryRule.update({ where: { id }, data });
  else await ctx.db.salaryRule.create({ data: { ...data, companyId: ctx.company.id } });
  revalidatePath(`/settings/users/${userId}`);
  return "Правило сохранено";
});

// ---- бонус / штраф / выплата ----
export const addSalaryEntryAction = safe(async (fd) => {
  const ctx = await requireUser();
  if (!ctx.user.perms.includes("cashOps") && !ctx.user.perms.includes("users")) throw new Error("Нет доступа");
  const userId = str(fd, "userId");
  const emp = await ctx.db.user.findUniqueOrThrow({ where: { id: userId } });
  const kind = str(fd, "kind");
  if (!["BONUS", "FINE", "PAYOUT"].includes(kind)) throw new Error("Выберите тип");
  const amount = toKop(fd.get("amount"));
  if (!(amount > 0)) throw new Error("Укажите сумму");
  const comment = opt(fd, "comment");
  const date = dateOf(str(fd, "date")) ?? new Date();
  let cashTxId: string | null = null;
  if (kind === "PAYOUT" && str(fd, "fromCash") === "1") {
    if (!ctx.user.perms.includes("cashOps")) throw new Error("Нет права записывать расходы из кассы");
    const box = opt(fd, "cashboxId") ? await ctx.db.cashbox.findUnique({ where: { id: str(fd, "cashboxId") } }) : null;
    const locationId = box?.locationId ?? ctx.location?.id;
    if (!locationId) throw new Error("Выберите точку");
    const tx = await addCashTransaction(
      { db: ctx.db, companyId: ctx.company.id },
      { locationId, cashboxId: opt(fd, "cashboxId"), userId: ctx.user.id, amount: -amount, method: (str(fd, "method") || "CASH") as PayMethod, category: "Зарплата", comment: `Зарплата: ${emp.name}${comment ? `. ${comment}` : ""}` },
    );
    cashTxId = tx.id;
  }
  await ctx.db.salaryEntry.create({ data: { companyId: ctx.company.id, userId, kind, amount, comment, date, cashTxId, createdById: ctx.user.id } });
  const label = { BONUS: "Бонус", FINE: "Штраф", PAYOUT: "Выплата зарплаты" }[kind];
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "users", text: `${label} сотруднику «${emp.name}»${comment ? `: ${comment}` : ""}`, amount: kind === "BONUS" ? amount : -amount });
  revalidatePath("/salary");
  return `${label} записан${kind === "PAYOUT" ? "а" : ""}`;
});

export const deleteSalaryEntryAction = safe(async (fd) => {
  const ctx = await requirePermission("users");
  const e = await ctx.db.salaryEntry.findUniqueOrThrow({ where: { id: str(fd, "id") } });
  if (e.cashTxId) throw new Error("Выплата прошла через кассу — удалите операцию в кассе, если она ошибочная");
  await ctx.db.salaryEntry.delete({ where: { id: e.id } });
  revalidatePath("/salary");
  return "Удалено";
});
