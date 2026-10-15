import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { StatusKind } from "@prisma/client";
import { prisma } from "../db";

export const DEFAULT_STATUSES: { name: string; kind: StatusKind; color: string }[] = [
  { name: "Принят", kind: "NEW", color: "#3b82f6" },
  { name: "Диагностика", kind: "IN_PROGRESS", color: "#8b5cf6" },
  { name: "Согласование с клиентом", kind: "WAITING", color: "#f59e0b" },
  { name: "Ждёт запчасть", kind: "WAITING", color: "#f97316" },
  { name: "В работе", kind: "IN_PROGRESS", color: "#6366f1" },
  { name: "Готов", kind: "READY", color: "#22c55e" },
  { name: "Выдан", kind: "CLOSED", color: "#64748b" },
  { name: "Отказ", kind: "CANCELED", color: "#ef4444" },
];

const DEFAULT_SOURCES = ["Повторный клиент", "Рекомендация", "Яндекс Карты", "2ГИС", "Авито", "Вывеска", "Другое"];

export type NewCompanyInput = {
  companyName: string;
  ownerName: string;
  email: string;
  password: string;
  locationName?: string;
  phone?: string;
};

/**
 * Регистрирует новую мастерскую: компанию, первую точку, владельца,
 * стандартные статусы и источники клиентов. Данные компании ни с кем не пересекаются.
 */
export async function createCompany(input: NewCompanyInput) {
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new Error("Пользователь с таким email уже зарегистрирован");
  if (input.password.length < 8) throw new Error("Пароль должен быть не короче 8 символов");
  const passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.companyName.trim(),
        phone: input.phone?.trim() || null,
        receiptTerms:
          "Мастерская не несёт ответственности за информацию на устройстве. Устройство, не востребованное в течение 90 дней после уведомления о готовности, может быть утилизировано. Гарантия распространяется только на выполненные работы и установленные запчасти.",
      },
    });
    const location = await tx.location.create({
      data: { companyId: company.id, name: input.locationName?.trim() || "Основная точка" },
    });
    const owner = await tx.user.create({
      data: {
        companyId: company.id,
        email,
        name: input.ownerName.trim(),
        passwordHash,
        role: "OWNER",
      },
    });
    await tx.orderStatus.createMany({
      data: DEFAULT_STATUSES.map((s, i) => ({ ...s, companyId: company.id, sort: i })),
    });
    await tx.adSource.createMany({
      data: DEFAULT_SOURCES.map((name) => ({ name, companyId: company.id })),
    });
    return { company, location, owner };
  });
}

export const newPublicToken = () => randomBytes(12).toString("base64url");
