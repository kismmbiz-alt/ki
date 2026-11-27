-- AlterTable
ALTER TABLE "StockDocItem" ADD COLUMN     "serials" TEXT;

-- AlterTable
ALTER TABLE "StockMove" ADD COLUMN     "link" TEXT;

-- ссылки на документы для уже существующей истории движений
UPDATE "StockMove" m SET "link" = '/sales/' || s."id"
FROM "Sale" s
WHERE m."link" IS NULL AND s."companyId" = m."companyId" AND m."type" = 'SALE' AND m."comment" = 'Продажа №' || s."number";

UPDATE "StockMove" m SET "link" = '/orders/' || o."id"
FROM "Order" o
WHERE m."link" IS NULL AND o."companyId" = m."companyId" AND (m."comment" = 'Заказ №' || o."number" OR m."comment" = 'Возврат из заказа №' || o."number");

UPDATE "StockMove" m SET "link" = '/stock/docs/' || d."id"
FROM "StockDoc" d
WHERE m."link" IS NULL AND d."companyId" = m."companyId" AND m."type" IN ('RECEIPT', 'WRITEOFF', 'TRANSFER', 'ADJUST')
  AND m."comment" ~ ('^(Поступление|Списание|Перемещение|Инвентаризация|Возврат поставщику) №' || d."number" || '(:|$)');
