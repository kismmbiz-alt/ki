import { prisma, tenantDb } from "../db";
import { logAction } from "../domain/log";
import { isPlatformAdmin } from "./admin";

const fmt = (d: Date) =>
  d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Владелец мастерской разрешает поддержке войти в CRM на N часов. */
export async function grantSupport(companyId: string, userId: string, hours: number, write: boolean) {
  if (!(hours > 0 && hours <= 24 * 14)) throw new Error("Срок доступа — от 1 часа до 14 дней");
  const until = new Date(Date.now() + hours * 3600_000);
  await prisma.company.update({
    where: { id: companyId },
    data: { supportUntil: until, supportWrite: write },
  });
  await logAction(tenantDb(companyId), {
    companyId,
    userId,
    kind: "support",
    text: `Разрешён доступ поддержки до ${fmt(until)} (${write ? "просмотр и изменения" : "только просмотр"})`,
  });
  return until;
}

/** Владелец мастерской закрывает доступ поддержки. Текущий вход поддержки сразу завершается. */
export async function revokeSupport(companyId: string, userId: string) {
  await prisma.company.update({
    where: { id: companyId },
    data: { supportUntil: null, supportWrite: false },
  });
  await prisma.supportLog.updateMany({
    where: { companyId, endedAt: null },
    data: { endedAt: new Date() },
  });
  await logAction(tenantDb(companyId), {
    companyId,
    userId,
    kind: "support",
    text: "Доступ поддержки закрыт",
  });
}

/** Владелец платформы входит в CRM компании. Вход записывается в журнал платформы и в журнал компании. */
export async function startSupport(
  sessionId: string,
  admin: {
    id: string;
    name: string;
    email: string;
    role: string;
    companyId: string;
  },
  companyId: string,
  reason: string,
) {
  if (!(await isPlatformAdmin(admin))) throw new Error("Нет доступа");
  if (admin.companyId === companyId) throw new Error("Это ваша собственная мастерская");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Компания не найдена");
  if (!company.supportUntil || company.supportUntil < new Date())
    throw new Error("Компания не дала доступ поддержке. Попросите владельца мастерской включить его: Настройки → Общие → «Доступ поддержки».");
  if (!reason.trim()) throw new Error("Напишите, зачем нужен вход — это попадёт в журнал");
  const owner = await prisma.user.findFirst({
    where: { companyId, role: "OWNER", isActive: true },
  });
  if (!owner) throw new Error("У компании нет активного владельца");
  const log = await prisma.supportLog.create({
    data: {
      companyId,
      adminId: admin.id,
      adminName: admin.name,
      write: company.supportWrite,
      reason: reason.trim().slice(0, 300),
    },
  });
  await prisma.session.update({
    where: { id: sessionId },
    data: { supportLogId: log.id, locationId: null },
  });
  await logAction(tenantDb(companyId), {
    companyId,
    kind: "support",
    text: `Поддержка ТехноСкупки (${admin.name}) вошла в CRM: ${reason.trim().slice(0, 200)}`,
  });
  return log;
}

/** Выход из режима поддержки. */
export async function endSupport(sessionId: string) {
  const s = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!s?.supportLogId) return;
  const log = await prisma.supportLog.findUnique({
    where: { id: s.supportLogId },
  });
  if (log && !log.endedAt) {
    await prisma.supportLog.update({
      where: { id: log.id },
      data: { endedAt: new Date() },
    });
    await logAction(tenantDb(log.companyId), {
      companyId: log.companyId,
      kind: "support",
      text: `Поддержка ТехноСкупки (${log.adminName}) вышла из CRM`,
    });
  }
  await prisma.session.update({
    where: { id: sessionId },
    data: { supportLogId: null, locationId: null },
  });
}
