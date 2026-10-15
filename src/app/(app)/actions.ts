"use server";

import { revalidatePath } from "next/cache";
import { requireUser, setSessionLocation } from "@/lib/auth";

export async function switchLocation(fd: FormData) {
  const ctx = await requireUser();
  const id = String(fd.get("locationId") ?? "");
  if (ctx.user.locationId) return;
  // точка должна принадлежать компании пользователя
  const loc = await ctx.db.location.findUnique({ where: { id } });
  if (loc) await setSessionLocation(ctx.session.id, loc.id);
  revalidatePath("/", "layout");
}
