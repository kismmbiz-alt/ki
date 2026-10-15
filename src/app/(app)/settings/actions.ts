"use server";

import { revalidatePath } from "next/cache";
import type { Role, StatusKind } from "@prisma/client";
import { hashPassword, newTotpSecret, requirePermission, requireUser, verifyPassword, verifyTotp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { int, opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";

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
    },
  });
  revalidatePath("/", "layout");
  return "Сохранено";
});

export const changePasswordAction = safe(async (fd) => {
  const { user } = await requireUser();
  if (!(await verifyPassword(str(fd, "current"), user.passwordHash))) throw new Error("Текущий пароль неверный");
  const next = str(fd, "next");
  if (next.length < 8) throw new Error("Новый пароль должен быть не короче 8 символов");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  // выходим на остальных устройствах
  await prisma.session.deleteMany({ where: { userId: user.id, NOT: { id: (await requireUser()).session.id } } });
  return "Пароль изменён";
});

export const start2faAction = safe(async () => {
  const { user } = await requireUser();
  if (user.totpEnabled) throw new Error("2FA уже включена");
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: newTotpSecret() } });
  revalidatePath("/settings");
});

export const confirm2faAction = safe(async (fd) => {
  const { user, session } = await requireUser();
  if (!user.totpSecret || !verifyTotp(user.totpSecret, str(fd, "code"))) throw new Error("Неверный код, попробуйте ещё раз");
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await prisma.session.update({ where: { id: session.id }, data: { twoFactorOk: true } });
  revalidatePath("/settings");
  return "Двухфакторная защита включена";
});

export const disable2faAction = safe(async (fd) => {
  const { user } = await requireUser();
  if (!user.totpSecret || !verifyTotp(user.totpSecret, str(fd, "code"))) throw new Error("Неверный код");
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  revalidatePath("/settings");
  return "2FA выключена";
});

// ---- точки ----
export const saveLocationAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = opt(fd, "id");
  const data = { name: str(fd, "name"), address: opt(fd, "address"), phone: opt(fd, "phone") };
  if (!data.name) throw new Error("Укажите название точки");
  if (id) await ctx.db.location.update({ where: { id }, data: { ...data, isActive: str(fd, "isActive") === "1" } });
  else await ctx.db.location.create({ data: { ...data, companyId: ctx.company.id } });
  revalidatePath("/", "layout");
  return id ? "Сохранено" : "Точка добавлена";
});

// ---- сотрудники ----
const ROLES: Role[] = ["ADMIN", "MANAGER", "MASTER"];

export const createUserAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const role = str(fd, "role") as Role;
  if (!ROLES.includes(role)) throw new Error("Недопустимая роль");
  const email = str(fd, "email").toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("Этот email уже используется");
  const password = str(fd, "password");
  if (password.length < 8) throw new Error("Пароль не короче 8 символов");
  await ctx.db.user.create({
    data: {
      companyId: ctx.company.id,
      email,
      name: str(fd, "name"),
      phone: opt(fd, "phone"),
      role,
      locationId: opt(fd, "locationId"),
      salaryPercent: int(fd, "salaryPercent"),
      passwordHash: await hashPassword(password),
    },
  });
  revalidatePath("/settings/users");
  return "Сотрудник добавлен";
});

export const updateUserAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = str(fd, "id");
  const target = await ctx.db.user.findUniqueOrThrow({ where: { id } });
  const isSelf = target.id === ctx.user.id;
  if (target.role === "OWNER" && ctx.user.role !== "OWNER") throw new Error("Владельца может менять только владелец");
  const role = str(fd, "role") as Role;
  const data: Parameters<typeof ctx.db.user.update>[0]["data"] = {
    name: str(fd, "name") || target.name,
    phone: opt(fd, "phone"),
    salaryPercent: int(fd, "salaryPercent"),
    locationId: opt(fd, "locationId"),
  };
  if (target.role !== "OWNER") {
    if (!ROLES.includes(role)) throw new Error("Недопустимая роль");
    data.role = role;
    if (!isSelf) data.isActive = str(fd, "isActive") === "1";
  }
  const password = str(fd, "password");
  if (password) {
    if (password.length < 8) throw new Error("Пароль не короче 8 символов");
    data.passwordHash = await hashPassword(password);
  }
  await ctx.db.user.update({ where: { id }, data });
  if (data.isActive === false || password) await prisma.session.deleteMany({ where: { userId: id } });
  revalidatePath("/settings/users");
  return "Сохранено";
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
