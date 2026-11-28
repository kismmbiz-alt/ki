"use server";

import { revalidatePath } from "next/cache";
import type { Role, StatusKind } from "@prisma/client";
import { denyInSupport, hashPassword, newTotpSecret, requirePermission, requireUser, verifyPassword, verifyTotp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { int, opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { isPerm } from "@/lib/perms";
import { logAction } from "@/lib/domain/log";
import { defaultWarehouseId } from "@/lib/domain/places";

export const saveCompanyAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  await prisma.company.update({
    where: { id: ctx.company.id },
    data: {
      name: str(fd, "name") || ctx.company.name,
      phone: opt(fd, "phone"),
      address: opt(fd, "address"),
      receiptTerms: opt(fd, "receiptTerms"),
      warrantyDays: int(fd, "warrantyDays", 30),
      email: opt(fd, "email"),
      currency: str(fd, "currency") || "RUB",
      companyNote: opt(fd, "companyNote"),
    },
  });
  revalidatePath("/", "layout");
  return "Сохранено";
});

export const saveRequisitesAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const keys = ["inn", "kpp", "ogrn", "director", "directorTitle", "directorBasis", "contract", "bankName", "bik", "swift", "corrAccount", "account"] as const;
  await prisma.company.update({ where: { id: ctx.company.id }, data: Object.fromEntries(keys.map((k) => [k, opt(fd, k)])) });
  revalidatePath("/settings");
  return "Реквизиты сохранены";
});

export const changePasswordAction = safe(async (fd) => {
  const ctx = await requireUser();
  denyInSupport(ctx);
  const { user } = ctx;
  if (!(await verifyPassword(str(fd, "current"), user.passwordHash))) throw new Error("Текущий пароль неверный");
  const next = str(fd, "next");
  if (next.length < 8) throw new Error("Новый пароль должен быть не короче 8 символов");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  // выходим на остальных устройствах
  await prisma.session.deleteMany({ where: { userId: user.id, NOT: { id: (await requireUser()).session.id } } });
  return "Пароль изменён";
});

export const start2faAction = safe(async () => {
  const ctx = await requireUser();
  denyInSupport(ctx);
  const { user } = ctx;
  if (user.totpEnabled) throw new Error("2FA уже включена");
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: newTotpSecret() } });
  revalidatePath("/settings");
});

export const confirm2faAction = safe(async (fd) => {
  const ctx = await requireUser();
  denyInSupport(ctx);
  const { user, session } = ctx;
  if (!user.totpSecret || !verifyTotp(user.totpSecret, str(fd, "code"))) throw new Error("Неверный код, попробуйте ещё раз");
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await prisma.session.update({ where: { id: session.id }, data: { twoFactorOk: true } });
  revalidatePath("/settings");
  return "Двухфакторная защита включена";
});

export const disable2faAction = safe(async (fd) => {
  const ctx = await requireUser();
  denyInSupport(ctx);
  const { user } = ctx;
  if (!user.totpSecret || !verifyTotp(user.totpSecret, str(fd, "code"))) throw new Error("Неверный код");
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  revalidatePath("/settings");
  return "2FA выключена";
});

// ---- точки ----
export const saveLocationAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = opt(fd, "id");
  const data = { name: str(fd, "name"), address: opt(fd, "address"), phone: opt(fd, "phone"), planRevenue: str(fd, "planRevenue") ? toKop(fd.get("planRevenue")) : 0 };
  if (!data.name) throw new Error("Укажите название точки");
  if (id) await ctx.db.location.update({ where: { id }, data: { ...data, isActive: str(fd, "isActive") === "1" } });
  else {
    const loc = await ctx.db.location.create({ data: { ...data, companyId: ctx.company.id } });
    await defaultWarehouseId(ctx.db, loc.id); // у новой точки сразу есть касса и склад
  }
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "settings", text: `${id ? "Изменена" : "Добавлена"} точка «${data.name}»` });
  revalidatePath("/", "layout");
  return id ? "Сохранено" : "Точка добавлена";
});

// ---- сотрудники ----

/** Должность из формы: проверяем, что она своя. Возвращает id и базовую роль. */
async function positionFrom(db: Awaited<ReturnType<typeof requirePermission>>["db"], fd: FormData) {
  const positionId = str(fd, "positionId");
  if (!positionId) throw new Error("Выберите должность");
  const p = await db.position.findUniqueOrThrow({ where: { id: positionId } });
  return { positionId: p.id, role: p.baseRole as Role, name: p.name };
}

export const createUserAction = safe(async (fd) => {
  const ctx = await requirePermission("users");
  denyInSupport(ctx);
  const pos = await positionFrom(ctx.db, fd);
  if (pos.role === "OWNER") throw new Error("Недопустимая должность");
  const email = str(fd, "email").toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("Этот email уже используется");
  const password = str(fd, "password");
  if (password.length < 8) throw new Error("Пароль не короче 8 символов");
  const name = str(fd, "name");
  await ctx.db.user.create({
    data: {
      companyId: ctx.company.id,
      email,
      name,
      phone: opt(fd, "phone"),
      role: pos.role,
      positionId: pos.positionId,
      locationId: opt(fd, "locationId"),
      salaryPercent: int(fd, "salaryPercent"),
      passwordHash: await hashPassword(password),
    },
  });
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "users", text: `Добавлен сотрудник «${name}», должность «${pos.name}»` });
  revalidatePath("/settings/users");
  return "Сотрудник добавлен";
});

export const updateUserAction = safe(async (fd) => {
  const ctx = await requirePermission("users");
  denyInSupport(ctx);
  const id = str(fd, "id");
  const target = await ctx.db.user.findUniqueOrThrow({ where: { id } });
  const isSelf = target.id === ctx.user.id;
  if (target.role === "OWNER" && ctx.user.role !== "OWNER") throw new Error("Владельца может менять только владелец");
  const data: Parameters<typeof ctx.db.user.update>[0]["data"] = {
    name: str(fd, "name") || target.name,
    phone: opt(fd, "phone"),
    salaryPercent: int(fd, "salaryPercent"),
    locationId: opt(fd, "locationId"),
  };
  if (target.role !== "OWNER") {
    const pos = await positionFrom(ctx.db, fd);
    if (isSelf && pos.positionId !== target.positionId) throw new Error("Свою должность может поменять только владелец или другой администратор");
    data.role = pos.role;
    data.positionId = pos.positionId;
    if (!isSelf) data.isActive = str(fd, "isActive") === "1";
  }
  const password = str(fd, "password");
  if (password) {
    if (password.length < 8) throw new Error("Пароль не короче 8 символов");
    data.passwordHash = await hashPassword(password);
  }
  await ctx.db.user.update({ where: { id }, data });
  if (data.isActive === false || password) await prisma.session.deleteMany({ where: { userId: id } });
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "users", text: `Изменён сотрудник «${data.name}»${password ? ", новый пароль" : ""}${data.isActive === false ? ", отключён" : ""}` });
  revalidatePath("/settings/users");
  return "Сохранено";
});

// ---- должности ----
export const savePositionAction = safe(async (fd) => {
  const ctx = await requirePermission("users");
  const id = opt(fd, "id");
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название должности");
  const baseRole = str(fd, "baseRole") as Role;
  if (!["ADMIN", "MANAGER", "MASTER"].includes(baseRole)) throw new Error("Выберите тип доступа");
  const perms = fd.getAll("perms").map(String).filter(isPerm);
  const md = str(fd, "maxDiscountPct");
  const maxDiscountPct = md === "" ? null : Math.min(100, Math.max(0, Math.round(Number(md.replace(",", ".")) || 0)));
  if (id && str(fd, "delete") === "1") {
    if (await ctx.db.user.count({ where: { positionId: id } })) throw new Error("На этой должности есть сотрудники. Сначала переведите их на другую");
    await ctx.db.position.delete({ where: { id } });
    await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "users", text: `Удалена должность «${name}»` });
    revalidatePath("/settings/positions");
    return "Должность удалена";
  }
  if (id) {
    // нельзя лишить самого себя права управлять сотрудниками
    if (ctx.user.positionId === id && !perms.includes("users")) throw new Error("Нельзя убрать у своей должности право «Сотрудники и должности»");
    await ctx.db.position.update({ where: { id }, data: { name, baseRole, perms, maxDiscountPct, sort: int(fd, "sort") } });
    await ctx.db.user.updateMany({ where: { positionId: id, role: { not: "OWNER" } }, data: { role: baseRole } });
  } else await ctx.db.position.create({ data: { companyId: ctx.company.id, name, baseRole, perms, maxDiscountPct, sort: int(fd, "sort") } });
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "users", text: `${id ? "Изменены права" : "Добавлена должность"} «${name}»: ${perms.length} прав` });
  revalidatePath("/", "layout");
  return id ? "Сохранено" : "Должность добавлена";
});

// ---- статусы ----
const KINDS: StatusKind[] = ["NEW", "IN_PROGRESS", "WAITING", "READY", "CLOSED", "CANCELED"];

export const saveStatusAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = opt(fd, "id");
  const kind = str(fd, "kind") as StatusKind;
  if (!KINDS.includes(kind)) throw new Error("Неверный тип статуса");
  const data = { name: str(fd, "name"), color: str(fd, "color") || "#64748b", kind, sort: int(fd, "sort") };
  if (!data.name) throw new Error("Укажите название");
  if (id) await ctx.db.orderStatus.update({ where: { id }, data });
  else await ctx.db.orderStatus.create({ data: { ...data, companyId: ctx.company.id } });
  revalidatePath("/settings/statuses");
  return "Сохранено";
});

// ---- прайс работ и источники ----
export const saveServiceAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = opt(fd, "id");
  const data = { name: str(fd, "name"), price: toKop(fd.get("price")) };
  if (!data.name) throw new Error("Укажите название");
  if (id) await ctx.db.service.update({ where: { id }, data: { ...data, isActive: str(fd, "isActive") === "1" } });
  else await ctx.db.service.create({ data: { ...data, companyId: ctx.company.id } });
  revalidatePath("/settings/catalog");
  return "Сохранено";
});

export const saveSourceAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = opt(fd, "id");
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название");
  if (id) await ctx.db.adSource.update({ where: { id }, data: { name, isActive: str(fd, "isActive") === "1" } });
  else await ctx.db.adSource.create({ data: { name, companyId: ctx.company.id } });
  revalidatePath("/settings/catalog");
  return "Сохранено";
});

const DICT_KIND_SET = new Set(["DEVICE_TYPE", "BRAND", "MODEL", "COLOR", "EQUIPMENT", "APPEARANCE", "DEFECT", "ORDER_TYPE"]);

export const addDictAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const kind = str(fd, "kind");
  if (!DICT_KIND_SET.has(kind)) throw new Error("Неизвестный справочник");
  const values = str(fd, "values")
    .split(/[\n;]/)
    .map((v) => v.trim())
    .filter((v) => v && v.length <= 120);
  if (!values.length) throw new Error("Впишите значение");
  await ctx.db.dictItem.createMany({
    data: values.map((value) => ({ companyId: ctx.company.id, kind: kind as never, value, sort: 500 })),
    skipDuplicates: true,
  });
  revalidatePath("/settings/dicts");
  return values.length > 1 ? `Добавлено: ${values.length}` : "Добавлено";
});

export const deleteDictAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  await ctx.db.dictItem.deleteMany({ where: { id: str(fd, "id") } });
  revalidatePath("/settings/dicts");
});
