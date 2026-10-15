import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Базовый клиент. Используется только там, где компании ещё нет:
// вход, регистрация, сессии, публичная страница статуса.
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Модели, принадлежащие компании. Для них tenantDb всегда подставляет companyId.
export const TENANT_MODELS = new Set<string>([
  "Location",
  "User",
  "AdSource",
  "Client",
  "OrderStatus",
  "Order",
  "OrderItem",
  "OrderEvent",
  "Service",
  "Product",
  "Stock",
  "StockMove",
  "CashTransaction",
  "Sale",
  "SaleItem",
]);

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

/**
 * Клиент базы, ограниченный одной компанией.
 * Любой запрос к таблицам компании получает фильтр companyId,
 * а любая создаваемая запись — companyId этой компании.
 * Связи между таблицами дополнительно защищены составными внешними ключами.
 */
export function tenantDb(companyId: string) {
  if (!companyId) throw new Error("tenantDb: companyId is required");
  return prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = (args ?? {}) as any;
          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), companyId };
          }
          if (operation === "create") {
            a.data = { ...a.data, companyId };
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((r: object) => ({ ...r, companyId }));
          }
          if (operation === "upsert") {
            a.create = { ...a.create, companyId };
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
export type Tx = Omit<TenantDb, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
export { Prisma };

/** База компании вместе с её id — передаётся во все бизнес-функции. */
export type Tenant = { db: TenantDb; companyId: string };
export const tenant = (companyId: string): Tenant => ({ db: tenantDb(companyId), companyId });
