"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getPendingSession, markTwoFactorOk, verifyPassword, verifyTotp } from "@/lib/auth";
import { createCompany } from "@/lib/domain/company";
import { safe, str } from "@/lib/action";
import { markInviteUsed, validInvite } from "@/lib/platform/invites";

export const login = safe(async (fd) => {
  const email = str(fd, "email").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await verifyPassword(str(fd, "password"), user.passwordHash)))
    throw new Error("Неверный email или пароль");
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { blockedAt: true } });
  if (company?.blockedAt) throw new Error("Доступ к мастерской приостановлен. Свяжитесь с поддержкой ТехноСкупки.");
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  await createSession(user.id, !user.totpEnabled);
  redirect(user.totpEnabled ? "/login/2fa" : "/dashboard");
});

export const verify2fa = safe(async (fd) => {
  const s = await getPendingSession();
  if (!s) redirect("/login");
  if (!s.user.totpSecret || !verifyTotp(s.user.totpSecret, str(fd, "code"))) throw new Error("Неверный код");
  await markTwoFactorOk(s.id);
  redirect("/dashboard");
});

export const register = safe(async (fd) => {
  // Регистрация по одноразовой ссылке из панели «Платформа» — без кода.
  // Иначе, если на сервере задан REGISTRATION_CODE, нужен этот код.
  const invite = await validInvite(str(fd, "invite"));
  if (str(fd, "invite") && !invite) throw new Error("Ссылка-приглашение уже использована или устарела. Попросите новую.");
  const code = process.env.REGISTRATION_CODE;
  if (!invite && code && str(fd, "inviteCode") !== code) throw new Error("Неверный код приглашения");
  if (str(fd, "password") !== str(fd, "password2")) throw new Error("Пароли не совпадают");
  const { owner } = await createCompany({
    companyName: str(fd, "companyName"),
    ownerName: str(fd, "ownerName"),
    email: str(fd, "email"),
    password: str(fd, "password"),
    phone: str(fd, "phone"),
    locationName: str(fd, "locationName"),
  });
  if (invite) await markInviteUsed(invite.id, owner.companyId);
  await createSession(owner.id, true);
  redirect("/dashboard");
});

export async function logout() {
  await destroySession();
  redirect("/login");
}
