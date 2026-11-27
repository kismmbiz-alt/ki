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
  const date = (k: string) => {
    const v = str(fd, k);
    const d = v ? new Date(`${v}T12:00:00`) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };
  const data = {
    name: str(fd, "name") || "Без имени",
    phone,
    email: opt(fd, "email"),
    notes: opt(fd, "notes"),
    adSourceId: opt(fd, "adSourceId"),
    ...(fd.has("passport")
      ? {
          address: opt(fd, "address"),
          inn: opt(fd, "inn"),
          birthDate: date("birthDate"),
          passport: opt(fd, "passport"),
          passportIssuedBy: opt(fd, "passportIssuedBy"),
          passportDate: date("passportDate"),
          passportCode: opt(fd, "passportCode"),
        }
      : {}),
  };
  if (id) {
    await db.client.update({ where: { id }, data });
    revalidatePath(`/clients/${id}`);
    return "Сохранено";
  }
  const c = await db.client.create({ data: { ...data, companyId: company.id } });
  redirect(`/clients/${c.id}`);
});
