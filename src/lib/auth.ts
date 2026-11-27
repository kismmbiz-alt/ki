import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import type { Role } from "@prisma/client";
import { prisma, tenantDb } from "./db";
import { ALL_PERMS, can, isPerm, ROLE_PERMS, type Permission } from "./perms";
import { isPlatformAdmin } from "./platform/admin";

const COOKIE = "crm_session";
const SESSION_DAYS = 30;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function hashPassword(p: string) {
  return bcrypt.hash(p, 10);
}
export async function verifyPassword(p: string, hash: string) {
  return bcrypt.compare(p, hash);
}

export async function createSession(userId: string, twoFactorOk: boolean) {
  const token = randomBytes(32).toString("base64url");
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoLogoutDays: true },
  });
  const days = u?.autoLogoutDays && u.autoLogoutDays > 0 ? Math.min(u.autoLogoutDays, SESSION_DAYS) : SESSION_DAYS;
  const expiresAt = new Date(Date.now() + days * 864e5);
  await prisma.session.create({
    data: { id: hashToken(token), userId, twoFactorOk, expiresAt },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const s = await prisma.session.findUnique({
      where: { id: hashToken(token) },
      select: { supportLogId: true },
    });
    if (s?.supportLogId)
      await prisma.supportLog.updateMany({
        where: { id: s.supportLogId, endedAt: null },
        data: { endedAt: new Date() },
      });
    await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  }
  jar.delete(COOKIE);
}

async function loadSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { company: true, position: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive || session.user.company.blockedAt) return null;
  return session;
}

/** Сессия, которая прошла пароль, но ещё ждёт код 2FA. */
export async function getPendingSession() {
  return loadSession();
}

export type Ctx = Awaited<ReturnType<typeof requireUser>>;

const SEEN_EVERY_MS = 5 * 60_000;

/** Режим поддержки: владелец платформы смотрит CRM другой компании с её разрешения. */
async function loadSupport(session: NonNullable<Awaited<ReturnType<typeof loadSession>>>) {
  if (!session.supportLogId) return null;
  const log = await prisma.supportLog.findUnique({
    where: { id: session.supportLogId },
    include: { company: true },
  });
  const now = new Date();
  const valid =
    log &&
    !log.endedAt &&
    log.company.supportUntil &&
    log.company.supportUntil > now &&
    !log.company.blockedAt &&
    (await isPlatformAdmin(session.user));
  const owner = valid
    ? await prisma.user.findFirst({
        where: { companyId: log.companyId, role: "OWNER", isActive: true },
        orderBy: { createdAt: "asc" },
        include: { company: true, position: true },
      })
    : null;
  if (!log || !valid || !owner) {
    // разрешение закончилось или отозвано — возвращаем владельца платформы в его компанию
    if (log && !log.endedAt)
      await prisma.supportLog.update({
        where: { id: log.id },
        data: { endedAt: now },
      });
    await prisma.session.update({
      where: { id: session.id },
      data: { supportLogId: null, locationId: null },
    });
    session.supportLogId = null;
    return null;
  }
  return { log, owner, write: log.write && log.company.supportWrite };
}

/** Текущий пользователь, его компания, выбранная точка и база, ограниченная компанией. */
export async function requireUser(opts: { allowInReadOnlySupport?: boolean } = {}) {
  const session = await loadSession();
  if (!session) redirect("/login");
  if (session.user.totpEnabled && !session.twoFactorOk) redirect("/login/2fa");
  const support = await loadSupport(session);
  const platformAdmin = await isPlatformAdmin(session.user);
  const base = support ? support.owner : session.user;
  if (support && !support.write && !opts.allowInReadOnlySupport && (await headers()).get("next-action"))
    throw new Error("Режим поддержки: только просмотр. Компания не разрешила вносить изменения.");
  if (!support && (!session.user.lastSeenAt || Date.now() - session.user.lastSeenAt.getTime() > SEEN_EVERY_MS))
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastSeenAt: new Date() },
    });

  const perms: Permission[] = base.role === "OWNER" ? ALL_PERMS : base.position ? base.position.perms.filter(isPerm) : ROLE_PERMS[base.role];
  const user = { ...base, perms };
  const db = tenantDb(user.companyId);

  const locations = await db.location.findMany({
    where: {
      isActive: true,
      ...(user.locationId ? { id: user.locationId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const location = locations.find((l) => l.id === (user.locationId ?? session.locationId)) ?? locations[0] ?? null;

  return {
    session,
    user,
    company: user.company,
    db,
    locations,
    location,
    /** Владелец платформы (видит панель «Платформа»). В режиме поддержки — про настоящего пользователя. */
    platformAdmin,
    support: support
      ? {
          companyName: support.log.company.name,
          write: support.write,
          until: support.log.company.supportUntil!,
          adminName: session.user.name,
        }
      : null,
  };
}

/** Пароли, 2FA и учётные записи сотрудников в режиме поддержки менять нельзя никогда. */
export function denyInSupport(ctx: { support: unknown }) {
  if (ctx.support) throw new Error("В режиме поддержки нельзя менять пароли, 2FA и учётные записи сотрудников");
}

/** Только для владельца платформы; в режиме поддержки — его собственная учётная запись. */
export async function requirePlatformAdmin() {
  const session = await loadSession();
  if (!session) redirect("/login");
  if (session.user.totpEnabled && !session.twoFactorOk) redirect("/login/2fa");
  if (!(await isPlatformAdmin(session.user))) redirect("/dashboard");
  return { session, admin: session.user };
}

export type { Permission };
export { can };

export async function requirePermission(p: Permission) {
  const ctx = await requireUser();
  if (!can(ctx.user, p)) redirect(p === "allOrders" ? "/orders" : "/dashboard");
  return ctx;
}

export function requireLocation(ctx: Ctx) {
  if (!ctx.location) throw new Error("Нет доступной точки. Добавьте точку в настройках.");
  return ctx.location;
}

export async function setSessionLocation(sessionId: string, locationId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { locationId },
  });
}

export async function markTwoFactorOk(sessionId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { twoFactorOk: true },
  });
}

export function verifyTotp(secret: string, code: string) {
  authenticator.options = { window: 1 };
  return authenticator.check(code.replace(/\s/g, ""), secret);
}

export function newTotpSecret() {
  return authenticator.generateSecret();
}

export function totpUri(email: string, secret: string) {
  return authenticator.keyuri(email, "ТехноСкупка", secret);
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  MANAGER: "Приёмщик",
  MASTER: "Мастер",
};
