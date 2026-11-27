"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, requirePermission, requireUser } from "@/lib/auth";
import { opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { normalizePhone } from "@/lib/domain/orders";
import { addBonus, refreshBonus } from "@/lib/domain/bonus";

/** Регистрация и изменение клиента. Контакты меняет только тот, кому их видно. */
export const saveClientAction = safe(async (fd) => {
  const { db, company, user } = await requireUser();
  const id = opt(fd, "id");
  const contacts = can(user, "clientContacts");
  const date = (k: string) => {
    const v = str(fd, k);
    const d = v ? new Date(`${v}T12:00:00`) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };
  const base = { name: str(fd, "name") || "Без имени", notes: opt(fd, "notes"), adSourceId: opt(fd, "adSourceId") };
  if (id) {
    const data: Record<string, unknown> = { ...base };
    if (contacts) {
      const phone = normalizePhone(str(fd, "phone"));
      if (!phone) throw new Error("Укажите телефон");
      Object.assign(data, { phone, email: opt(fd, "email") });
      if (fd.has("passport"))
        Object.assign(data, {
          address: opt(fd, "address"),
          inn: opt(fd, "inn"),
          birthDate: date("birthDate"),
          passport: opt(fd, "passport"),
          passportIssuedBy: opt(fd, "passportIssuedBy"),
          passportDate: date("passportDate"),
          passportCode: opt(fd, "passportCode"),
        });
    }
    await db.client.update({ where: { id }, data });
    revalidatePath(`/clients/${id}`);
    return "Сохранено";
  }
  // регистрация нового клиента: телефон вводит любой сотрудник, но потом видит его только владелец
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) throw new Error("Укажите телефон");
  const ex = await db.client.findFirst({ where: { phone }, select: { id: true } });
  if (ex) redirect(`/clients/${ex.id}?exists=1`);
  const c = await db.client.create({ data: { ...base, phone, email: opt(fd, "email"), birthDate: date("birthDate"), companyId: company.id } });
  if (company.bonusEnabled && company.bonusWelcome > 0)
    await addBonus(db, company.id, company, { clientId: c.id, amount: company.bonusWelcome, kind: "WELCOME", userId: user.id, comment: "Приветственные баллы", delay: false });
  redirect(`/clients/${c.id}`);
});

/** Ручное начисление или списание баллов. */
export const manualBonusAction = safe(async (fd) => {
  const ctx = await requirePermission("bonusManual");
  const clientId = str(fd, "clientId");
  const sign = str(fd, "sign") === "-" ? -1 : 1;
  const amount = toKop(fd.get("amount"));
  if (!(amount > 0)) throw new Error("Укажите количество баллов");
  const comment = opt(fd, "comment") ?? undefined;
  await ctx.db.client.findUniqueOrThrow({ where: { id: clientId } });
  if (sign < 0) {
    const st = await refreshBonus(ctx.db, ctx.company.id, clientId);
    if (amount > st.balance) throw new Error(`У клиента только ${(st.balance / 100).toLocaleString("ru-RU")} баллов`);
    await ctx.db.bonusTx.create({ data: { companyId: ctx.company.id, clientId, kind: "MANUAL", amount: -amount, userId: ctx.user.id, comment } });
  } else await addBonus(ctx.db, ctx.company.id, ctx.company, { clientId, amount, kind: "MANUAL", userId: ctx.user.id, comment, delay: false });
  revalidatePath(`/clients/${clientId}`);
  return sign < 0 ? "Баллы списаны" : "Баллы начислены";
});
