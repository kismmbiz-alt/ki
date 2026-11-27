-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "color" TEXT,
ADD COLUMN     "condition" TEXT;

-- разобрать все объявления заново: добавились состояние и цвет
UPDATE "Listing" SET "parsedAt" = NULL;
