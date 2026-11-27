import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { salaryFirstDate, salaryPeriods } from "@/lib/domain/salary";

/** Доступ к зарплате и расчётные периоды компании. */
export async function salaryCtx() {
  const ctx = await requireUser();
  if (!can(ctx.user, "cash") && !can(ctx.user, "users")) redirect("/dashboard");
  const first = await salaryFirstDate(ctx.db, ctx.company.createdAt);
  const periods = salaryPeriods(ctx.company, first);
  return { ...ctx, periods };
}
