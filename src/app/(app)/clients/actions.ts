"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { opt, safe, str } from "@/lib/action";
import { normalizePhone } from "@/lib/domain/orders";

export const saveClientAction = safe(async (fd) => {
  const { db, company } = await requireUser();
  const id = opt(fd, "id");
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) throw new Error("Укажите телефон");
  const data = { name: str(fd, "name") || "Без имени", phone, email: opt(fd, "email"), notes: opt(fd, "notes"), adSourceId: opt(fd, "adSourceId") };
  if (id) {
    await db.client.update({ where: { id }, data });
    revalidatePath(`/clients/${id}`);
    return "Сохранено";
  }
  const c = await db.client.create({ data: { ...data, companyId: company.id } });
  redirect(`/clients/${c.id}`);
});
