import type { ApprovalStatus } from "@prisma/client";
import { prisma } from "../db";

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Новая заявка",
  TALKING: "Разговор",
  AWAITING_PAYMENT: "Ждёт оплату",
  PAID: "Оплачено",
  APPROVED: "Одобрена",
  REJECTED: "Отказ",
};

export const APPROVAL_COLOR: Record<ApprovalStatus, string> = {
  PENDING: "#3b82f6",
  TALKING: "#8b5cf6",
  AWAITING_PAYMENT: "#f59e0b",
  PAID: "#16a34a",
  APPROVED: "#16a34a",
  REJECTED: "#ef4444",
};

export const APPROVAL_ORDER: ApprovalStatus[] = ["PENDING", "TALKING", "AWAITING_PAYMENT", "PAID", "APPROVED", "REJECTED"];

/** Доступ к CRM открыт только после одобрения или оплаты. */
export const hasAccess = (s: ApprovalStatus) => s === "APPROVED" || s === "PAID";

export const isApprovalStatus = (s: string): s is ApprovalStatus => (APPROVAL_ORDER as string[]).includes(s);

/** Владелец платформы меняет статус заявки и заметку. */
export async function setApproval(companyId: string, status: ApprovalStatus, note?: string | null) {
  return prisma.company.update({
    where: { id: companyId },
    data: { approval: status, approvalAt: new Date(), ...(note !== undefined ? { approvalNote: note?.slice(0, 2000) || null } : {}) },
  });
}

/** Что видит партнёр, пока доступа нет. */
export function pendingText(s: ApprovalStatus) {
  if (s === "REJECTED") return { title: "Заявка отклонена", text: "Главный администратор отклонил заявку. Если это ошибка, свяжитесь с ним." };
  if (s === "AWAITING_PAYMENT")
    return { title: "Ожидаем оплату", text: "Заявка одобрена к подключению. Доступ к CRM откроется сразу после оплаты." };
  if (s === "TALKING")
    return { title: "Заявка на рассмотрении", text: "Главный администратор уже связался с вами по заявке. Доступ откроется после его подтверждения или после оплаты." };
  return {
    title: "Заявка на рассмотрении",
    text: "Спасибо за регистрацию! Главный администратор проверит и подтвердит вашу заявку, после этого вы сможете пользоваться CRM. Доступ также открывается после оплаты.",
  };
}
