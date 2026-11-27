import { randomBytes } from "crypto";
import { prisma } from "../db";

/** Новая одноразовая ссылка для регистрации мастерской. */
export async function createInvite(note: string | null, days = 14) {
  const token = randomBytes(9).toString("base64url");
  return prisma.platformInvite.create({
    data: {
      token,
      note: note?.slice(0, 200) || null,
      expiresAt: new Date(Date.now() + days * 864e5),
    },
  });
}

/** Действующее (не использованное и не просроченное) приглашение. */
export async function validInvite(token: string | null | undefined) {
  if (!token) return null;
  const inv = await prisma.platformInvite.findUnique({ where: { token } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

/** Отметить приглашение использованным. Возвращает false, если его успели использовать. */
export async function markInviteUsed(id: string, companyId: string) {
  const r = await prisma.platformInvite.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date(), companyId },
  });
  return r.count === 1;
}
