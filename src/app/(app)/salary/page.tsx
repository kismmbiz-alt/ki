import { redirect } from "next/navigation";

/** Зарплата переехала в Финансы. */
export default async function OldSalaryPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user } = await searchParams;
  redirect(user ? `/cash/salary/${user}` : "/cash/salary");
}
