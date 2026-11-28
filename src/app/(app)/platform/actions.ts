"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { int, safe, str } from "@/lib/action";
import { createInvite } from "@/lib/platform/invites";
import { APPROVAL_LABEL, isApprovalStatus, setApproval } from "@/lib/platform/approval";
import { endSupport, grantSupport, revokeSupport, startSupport } from "@/lib/platform/support";

// ---- владелец платформы ----

export const createInviteAction = safe(async (fd) => {
  await requirePlatformAdmin();
  await createInvite(str(fd, "note") || null, int(fd, "days", 14));
  revalidatePath("/platform/invites");
  return "Ссылка создана — скопируйте её ниже и отправьте коллеге";
});

export const setApprovalAction = safe(async (fd) => {
  const { admin } = await requirePlatformAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!isApprovalStatus(status)) throw new Error("Неизвестный статус");
  if (id === admin.companyId) throw new Error("Это ваша мастерская");
  await setApproval(id, status, fd.has("note") ? str(fd, "note") : undefined);
  revalidatePath("/platform", "layout");
  return `Статус: ${APPROVAL_LABEL[status]}`;
});

export const deleteInviteAction = safe(async (fd) => {
  await requirePlatformAdmin();
  await prisma.platformInvite.deleteMany({
    where: { id: str(fd, "id"), usedAt: null },
  });
  revalidatePath("/platform/invites");
});

export const blockCompanyAction = safe(async (fd) => {
  const { admin } = await requirePlatformAdmin();
  const id = str(fd, "id");
  if (id === admin.companyId) throw new Error("Свою мастерскую приостановить нельзя");
  const block = str(fd, "block") === "1";
  await prisma.company.update({
    where: { id },
    data: { blockedAt: block ? new Date() : null },
  });
  if (block) {
    // выкидываем сотрудников компании из CRM
    await prisma.session.deleteMany({ where: { user: { companyId: id } } });
  }
  revalidatePath("/platform/companies");
  return block ? "Доступ приостановлен" : "Доступ восстановлен";
});

export const startSupportAction = safe(async (fd) => {
  const { session, admin } = await requirePlatformAdmin();
  await startSupport(session.id, admin, str(fd, "companyId"), str(fd, "reason"));
  redirect("/dashboard");
});

export async function endSupportAction() {
  const { session } = await requirePlatformAdmin();
  await endSupport(session.id);
  redirect("/platform/companies");
}

// ---- владелец мастерской: доступ поддержки ----

export const grantSupportAction = safe(async (fd) => {
  const ctx = await requireUser();
  if (ctx.support || ctx.user.role !== "OWNER") throw new Error("Открыть доступ может только владелец мастерской");
  const until = await grantSupport(ctx.company.id, ctx.user.id, int(fd, "hours", 24), str(fd, "write") === "1");
  revalidatePath("/settings");
  return `Доступ открыт до ${until.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
});

export const revokeSupportAction = safe(async () => {
  const ctx = await requireUser();
  if (ctx.support || ctx.user.role !== "OWNER") throw new Error("Закрыть доступ может только владелец мастерской");
  await revokeSupport(ctx.company.id, ctx.user.id);
  revalidatePath("/settings");
  return "Доступ поддержки закрыт";
});
