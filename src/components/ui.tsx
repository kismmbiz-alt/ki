import Link from "next/link";

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-[var(--field)] px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-70";

/** Классы поля: если задана своя ширина (w-40 и т. п.), убираем w-full, иначе поле растягивается на всю строку. */
export const fieldCls = (extra?: string) => {
  const own = extra ?? "";
  return /(^|\s)w-/.test(own) ? `${inputCls.replace("w-full ", "")} ${own}` : `${inputCls} ${own}`;
};

export function Field({ label, children, hint, className = "" }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldCls(props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={fieldCls(props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={fieldCls(props.className)} />;
}

export function Card({ title, children, actions, className = "" }: { title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, children, back }: { title: React.ReactNode; children?: React.ReactNode; back?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {back && (
          <Link href={back} className="text-slate-400 hover:text-slate-700">
            ←
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: color + "1f", color, borderColor: color + "66" }}
    >
      {children}
    </span>
  );
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="card scroll-thin overflow-x-auto">
      <table className="data-table w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold tracking-wide uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {!hasRows && <p className="p-6 text-center text-sm text-slate-400">{empty ?? "Пока пусто"}</p>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export const dt = (d: Date | null | undefined) =>
  d ? d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
export const dOnly = (d: Date | null | undefined) => (d ? d.toLocaleDateString("ru-RU") : "");

export type BtnVariant = "primary" | "secondary" | "danger" | "success";
export function btn(variant: BtnVariant = "primary") {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition active:scale-[.98] disabled:opacity-50";
  if (variant === "primary") return `${base} btn-primary on-accent`;
  if (variant === "success") return `${base} btn-success on-accent`;
  if (variant === "danger") return `${base} btn-danger`;
  return `${base} btn-secondary`;
}

/** Значение для <input type="datetime-local"> в часовом поясе сервера. */
export const toLocalInput = (d: Date | null | undefined) =>
  d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

/** Заголовок раздела внутри карточки, как «КЛИЕНТ», «УСТРОЙСТВО». */
export function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="mb-3 border-l-[3px] border-blue-600 pl-2 text-xs font-semibold uppercase tracking-wider text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

/** Ссылки «позвонить / WhatsApp / Telegram» по номеру телефона. */
export function PhoneLinks({ phone }: { phone: string }) {
  const digits = phone.replace(/\D/g, "");
  const cls = "inline-flex h-7 items-center rounded-md px-2 text-xs font-medium on-accent";
  return (
    <span className="inline-flex gap-1">
      <a href={`tel:${phone}`} className={`${cls} bg-[#64748b]`} title="Позвонить">
        Звонок
      </a>
      <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className={`${cls} bg-[#25d366]`} title="Написать в WhatsApp">
        WhatsApp
      </a>
      <a href={`https://t.me/+${digits}`} target="_blank" rel="noreferrer" className={`${cls} bg-[#2aabee]`} title="Написать в Telegram">
        Telegram
      </a>
    </span>
  );
}
