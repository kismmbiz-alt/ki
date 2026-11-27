import { prisma } from "@/lib/db";
import { internalEan13 } from "@/lib/barcode";

/** Следующий свободный внутренний штрихкод компании (EAN-13 с префиксом 2). */
export async function nextBarcode(companyId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const c = await prisma.company.update({ where: { id: companyId }, data: { barcodeSeq: { increment: 1 } }, select: { barcodeSeq: true } });
    const code = internalEan13(c.barcodeSeq);
    const taken = await prisma.product.findFirst({ where: { companyId, barcode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("Не удалось подобрать штрихкод");
}

/** Выдать штрихкоды всем товарам без штрихкода. Возвращает, сколько выдано. */
export async function fillMissingBarcodes(companyId: string): Promise<number> {
  const list = await prisma.product.findMany({ where: { companyId, OR: [{ barcode: null }, { barcode: "" }] }, select: { id: true } });
  for (const p of list) await prisma.product.update({ where: { id: p.id }, data: { barcode: await nextBarcode(companyId) } });
  return list.length;
}
