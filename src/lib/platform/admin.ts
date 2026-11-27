import { prisma } from "../db";

let firstCompanyId: string | null | undefined;

/**
 * Владелец платформы (сервиса ТехноСкупка) — не админ мастерской, а тот, кто держит сервер.
 * Список email задаётся в .env: PLATFORM_ADMINS="a@b.ru,c@d.ru".
 * Если не задан — владелец самой первой зарегистрированной мастерской.
 */
export async function isPlatformAdmin(user: { email: string; role: string; companyId: string }) {
  const list = (process.env.PLATFORM_ADMINS ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length) return list.includes(user.email.toLowerCase());
  if (user.role !== "OWNER") return false;
  if (firstCompanyId === undefined || firstCompanyId === null) {
    const c = await prisma.company.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    firstCompanyId = c?.id ?? null;
  }
  return firstCompanyId === user.companyId;
}

/** Только для тестов: сбросить запомненную первую компанию. */
export function resetPlatformAdminCache() {
  firstCompanyId = undefined;
}
