"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getPendingSession, markTwoFactorOk, verifyPassword, verifyTotp } from "@/lib/auth";
import { createCompany } from "@/lib/domain/company";
import { safe, str } from "@/lib/action";

export const login = safe(async (fd) => {
  const email = str(fd, "email").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await verifyPassword(str(fd, "password"), user.passwordHash)))
    throw new Error("Неверный email или пароль");
  await createSession(user.id, !user.totpEnabled);
  redirect(user.totpEnabled ? "/login/2fa" : "/orders");
});

export const verify2fa = safe(async (fd) => {
  const s = await getPendingSession();
  if (!s) redirect("/login");
  if (!s.user.totpSecret || !verifyTotp(s.user.totpSecret, str(fd, "code"))) throw new Error("Неверный код");
  await markTwoFactorOk(s.id);
  redirect("/orders");
});

export const register = safe(async (fd) => {
  // Если на сервере задан REGISTRATION_CODE, новую мастерскую можно создать только с этим кодом.
  const code = process.env.REGISTRATION_CODE;
  if (code && str(fd, "inviteCode") !== code) throw new Error("Неверный код приглашения");
  if (str(fd, "password") !== str(fd, "password2")) throw new Error("Пароли не совпадают");
  const { owner } = await createCompany({
    companyName: str(fd, "companyName"),
    ownerName: str(fd, "ownerName"),
    email: str(fd, "email"),
    password: str(fd, "password"),
    phone: str(fd, "phone"),
    locationName: str(fd, "locationName"),
  });
  await createSession(owner.id, true);
  redirect("/orders");
});

export async function logout() {
  await destroySession();
  redirect("/login");
}
