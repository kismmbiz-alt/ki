"use server";

import { revalidatePath } from "next/cache";
import { requireLocation, requirePermission } from "@/lib/auth";
import { importClients, importProducts, readTable, type ImportReport } from "@/lib/domain/import";

export type ImportState = { error?: string; report?: ImportReport; dryRun?: boolean } | undefined;

const MAX = 15 * 1024 * 1024;

export async function importAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  try {
    const kind = String(fd.get("kind"));
    const ctx = await requirePermission(kind === "clients" ? "settings" : "stock");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return { error: "Выберите файл" };
    if (file.size > MAX) return { error: "Файл больше 15 МБ" };
    const dryRun = fd.get("dryRun") === "1";
    const table = await readTable(file);
    const t = { db: ctx.db, companyId: ctx.company.id };
    const report =
      kind === "clients"
        ? await importClients(t, table, { dryRun })
        : await importProducts(t, table, { dryRun, locationId: requireLocation(ctx).id, userId: ctx.user.id });
    if (!dryRun) {
      revalidatePath("/stock");
      revalidatePath("/clients");
    }
    return { report, dryRun };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
