import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import type { Role } from "@prisma/client";
import { prisma, tenantDb } from "./db";
import { ALL_PERMS, can, isPerm, ROLE_PERMS, type Permission } from "./perms";

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
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { autoLogoutDays: true } });
  const days = u?.autoLogoutDays && u.autoLogoutDays > 0 ? Math.min(u.autoLogoutDays, SESSION_DAYS) : SESSION_DAYS;
  const expiresAt = new Date(Date.now() + days * 864e5);
  await prisma.session.create({ data: { id: hashToken(token), userId, twoFactorOk, expiresAt } });
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
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(COOKIE);
}

async function loadSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { company: true, position: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  return session;
}

/** Сессия, которая прошла пароль, но ещё ждёт код 2FA. */
export async function getPendingSession() {
  return loadSession();
}

export type Ctx = Awaited<ReturnType<typeof requireUser>>;

/** Текущий пользователь, его компания, выбранная точка и база, ограниченная компанией. */
export async function requireUser() {
  const session = await loadSession();
  if (!session) redirect("/login");
  if (session.user.totpEnabled && !session.twoFactorOk) redirect("/login/2fa");
  const perms: Permission[] =
    session.user.role === "OWNER" ? ALL_PERMS : session.user.position ? session.user.position.perms.filter(isPerm) : ROLE_PERMS[session.user.role];
  const user = { ...session.user, perms };
  const db = tenantDb(user.companyId);

  const locations = await db.location.findMany({
    where: { isActive: true, ...(user.locationId ? { id: user.locationId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  const location =
    locations.find((l) => l.id === (user.locationId ?? session.locationId)) ?? locations[0] ?? null;

  return { session, user, company: user.company, db, locations, location };
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
  await prisma.session.update({ where: { id: sessionId }, data: { locationId } });
}

export async function markTwoFactorOk(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { twoFactorOk: true } });
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
