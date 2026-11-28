import Link from "next/link";
import { notFound } from "next/navigation";
import { DOC_SLUGS, legalDoc, LEGAL_VERSION, type DocSlug } from "@/lib/legal/docs";

export const dynamic = "force-dynamic";

/** Публичная страница документа площадки. */
export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!(DOC_SLUGS as string[]).includes(doc)) notFound();
  const d = legalDoc(doc as DocSlug);
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-800">
      <article className="mx-auto max-w-3xl">
        <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {DOC_SLUGS.map((s) => (
            <Link key={s} href={`/legal/${s}`} className={s === doc ? "font-semibold text-slate-900" : "text-blue-600 hover:underline"}>
              {legalDoc(s).short}
            </Link>
          ))}
        </nav>
        <h1 className="mb-1 text-2xl font-semibold">{d.title}</h1>
        <p className="mb-6 text-sm text-slate-500">Редакция от {LEGAL_VERSION.split("-").reverse().join(".")}</p>
        {d.sections.map((s, i) => (
          <section key={i} className="mb-5">
            {s.h && <h2 className="mb-2 text-lg font-semibold">{s.h}</h2>}
            {s.p.map((p, j) => (
              <p key={j} className="mb-2 leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}
        <p className="mt-8 text-sm">
          <Link href="/register" className="text-blue-600 hover:underline">
            ← К регистрации
          </Link>
        </p>
      </article>
    </main>
  );
}
