// Бонусная система: начисление с продаж и заказов, оплата баллами, сгорание.
// 1 балл = 1 ₽, все суммы в копейках. Проценты хранятся в сотых долях: 300 = 3%.

import type { BonusKind } from "@prisma/client";
import type { Tx } from "../db";

export type BonusRules = {
  bonusEnabled: boolean;
  bonusSalePct: number;
  bonusOrderPct: number;
  bonusMinCheck: number;
  bonusMaxPayPct: number;
  bonusDelayDays: number;
  bonusExpireDays: number;
  bonusWelcome: number;
  bonusAccrueOnBonusPay: boolean;
};

export const BONUS_LABEL: Record<BonusKind, string> = {
  ACCRUE: "Начислено",
  SPEND: "Оплата баллами",
  EXPIRE: "Сгорели",
  WELCOME: "Приветственные",
  MANUAL: "Вручную",
  RETURN: "Возврат",
};

const DAY = 864e5;
export const pctOf = (amount: number, bp: number) => Math.floor((amount * bp) / 10000);
/** Сколько можно оплатить баллами в чеке на total. */
export const maxBonusPay = (total: number, r: Pick<BonusRules, "bonusMaxPayPct">) => Math.max(0, pctOf(total, r.bonusMaxPayPct));

type Row = { amount: number; activeFrom: Date; expiresAt: Date | null; createdAt: Date };

/**
 * Разбор движений по правилу «сначала тратятся баллы, которые раньше сгорают».
 * Возвращает баланс, доступные сейчас баллы и сколько должно сгореть к моменту now.
 */
export function bonusState(rows: Row[], now = new Date()) {
  const plus = rows.filter((r) => r.amount > 0).sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) || a.createdAt.getTime() - b.createdAt.getTime());
  let used = -rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  let balance = 0;
  let pending = 0;
  let toExpire = 0;
  for (const p of plus) {
    const take = Math.min(used, p.amount);
    used -= take;
    const left = p.amount - take;
    if (!left) continue;
    if (p.expiresAt && p.expiresAt <= now) toExpire += left;
    else {
      balance += left;
      if (p.activeFrom > now) pending += left;
    }
  }
  // если списали больше, чем начислили (возврат после траты), баланс уходит в минус
  balance -= used;
  return { balance, available: Math.max(balance - pending, 0), pending, toExpire };
}

/** Списывает сгоревшие баллы клиента и возвращает актуальное состояние. */
export async function refreshBonus(tx: Tx, companyId: string, clientId: string, now = new Date()) {
  const rows = await tx.bonusTx.findMany({ where: { clientId }, select: { amount: true, activeFrom: true, expiresAt: true, createdAt: true } });
  const st = bonusState(rows, now);
  if (st.toExpire > 0) {
    await tx.bonusTx.create({ data: { companyId, clientId, kind: "EXPIRE", amount: -st.toExpire, comment: "Срок действия баллов истёк" } });
    return bonusState([...rows, { amount: -st.toExpire, activeFrom: now, expiresAt: null, createdAt: now }], now);
  }
  return st;
}

/** Начисление баллов: с учётом минимального чека, задержки и срока жизни. Возвращает сумму. */
export async function accrueBonus(
  tx: Tx,
  companyId: string,
  r: BonusRules,
  a: { clientId: string | null | undefined; base: number; pct: number; kind?: BonusKind; saleId?: string; orderId?: string; userId?: string; comment?: string },
) {
  if (!r.bonusEnabled || !a.clientId || a.base <= 0 || a.base < r.bonusMinCheck) return 0;
  const amount = pctOf(a.base, a.pct);
  if (amount <= 0) return 0;
  await addBonus(tx, companyId, r, { clientId: a.clientId, amount, kind: a.kind ?? "ACCRUE", saleId: a.saleId, orderId: a.orderId, userId: a.userId, comment: a.comment });
  return amount;
}

/** Плюс баллов с задержкой и сроком сгорания из настроек. */
export async function addBonus(tx: Tx, companyId: string, r: BonusRules, a: { clientId: string; amount: number; kind: BonusKind; saleId?: string; orderId?: string; userId?: string; comment?: string; delay?: boolean }) {
  const now = Date.now();
  const activeFrom = new Date(now + (a.delay === false ? 0 : r.bonusDelayDays) * DAY);
  const expiresAt = r.bonusExpireDays > 0 ? new Date(activeFrom.getTime() + r.bonusExpireDays * DAY) : null;
  return tx.bonusTx.create({ data: { companyId, clientId: a.clientId, kind: a.kind, amount: a.amount, saleId: a.saleId, orderId: a.orderId, userId: a.userId, comment: a.comment, activeFrom, expiresAt } });
}

/** Оплата баллами: проверяет доступный остаток и лимит по чеку. */
export async function spendBonus(tx: Tx, companyId: string, r: BonusRules, a: { clientId: string; amount: number; checkTotal: number; saleId?: string; orderId?: string; userId?: string; comment?: string }) {
  if (!r.bonusEnabled) throw new Error("Бонусная система выключена в настройках");
  const st = await refreshBonus(tx, companyId, a.clientId);
  const limit = maxBonusPay(a.checkTotal, r);
  if (a.amount > limit) throw new Error(`Баллами можно оплатить не больше ${(limit / 100).toLocaleString("ru-RU")} ₽ (${r.bonusMaxPayPct / 100}% чека)`);
  if (a.amount > st.available) throw new Error(`У клиента доступно только ${(st.available / 100).toLocaleString("ru-RU")} баллов`);
  return tx.bonusTx.create({ data: { companyId, clientId: a.clientId, kind: "SPEND", amount: -a.amount, saleId: a.saleId, orderId: a.orderId, userId: a.userId, comment: a.comment } });
}

/** Скрываем телефон от сотрудников: +7 *** ***-**-67. */
export const maskPhone = (p: string | null | undefined) => (p ? p.replace(/\d(?=\d{2})/g, (d, i: number) => (i < 2 ? d : "•")) : "");
