export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="theme-dark flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,#23284a,#15171c_60%)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f6bff] to-[#7c4dff] text-xl font-bold text-[#fff]">
            М
          </div>
          <div className="text-2xl font-semibold text-slate-900">Мастерская CRM</div>
          <div className="text-sm text-slate-500">учёт ремонтов, склада и кассы</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-black/30">{children}</div>
      </div>
    </main>
  );
}
