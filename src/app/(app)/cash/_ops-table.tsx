import Link from "next/link";
import { dt, Table } from "@/components/ui";
import { rub } from "@/lib/money";
import { PAY_LABEL } from "@/lib/domain/cash";

type Op = {
  id: string;
  createdAt: Date;
  amount: number;
  method: keyof typeof PAY_LABEL;
  category: string;
  comment: string | null;
  transferId: string | null;
  user: { name: string } | null;
  cashbox: { name: string };
  order: { id: string; number: number } | null;
  sale: { id: string } | null;
};

export function OpsTable({ list, empty = "Операций нет" }: { list: Op[]; empty?: string }) {
  return (
    <Table head={["Время", "Касса", "Статья", "Способ", "Сумма", "Кто", "Комментарий"]} empty={empty}>
      {list.map((x) => {
        const href = x.order ? `/orders/${x.order.id}` : x.sale ? `/sales/${x.sale.id}` : null;
        return (
          <tr key={x.id}>
            <td className="whitespace-nowrap px-3 py-2 text-slate-500">{dt(x.createdAt)}</td>
            <td className="px-3 py-2">{x.cashbox.name}</td>
            <td className="px-3 py-2">
              {href ? (
                <Link href={href} className="text-blue-600 hover:underline">
                  {x.category}
                </Link>
              ) : (
                <span className={x.transferId ? "text-slate-500" : ""}>{x.category}</span>
              )}
            </td>
            <td className="px-3 py-2 text-slate-500">{PAY_LABEL[x.method]}</td>
            <td className={`whitespace-nowrap px-3 py-2 font-medium ${x.amount < 0 ? "text-red-600" : "text-green-700"}`}>{rub(x.amount)}</td>
            <td className="px-3 py-2 text-slate-500">{x.user?.name}</td>
            <td className="px-3 py-2 text-slate-500">{x.comment}</td>
          </tr>
        );
      })}
    </Table>
  );
}
