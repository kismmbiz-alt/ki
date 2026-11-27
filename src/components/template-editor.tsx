"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Minus, Table, Code, Eye, List } from "lucide-react";

type Group = { title: string; vars: string[] };

const BASE = `
.tpl-sheet{background:#fff;color:#000;font:10pt Arial,Helvetica,sans-serif;line-height:1.25}
.tpl-sheet p{margin:0;min-height:1em}
.tpl-sheet h1{font-size:16pt;margin:0 0 4px}.tpl-sheet h2{font-size:14pt;margin:0 0 4px}.tpl-sheet h3{font-size:12pt;margin:0 0 4px}
.tpl-sheet hr{border:0;border-top:1px solid #000;margin:4px 0}
.tpl-sheet table{border-collapse:collapse;width:100%}
.tpl-sheet td,.tpl-sheet th{border:1px solid #000;padding:1px 4px;vertical-align:top;min-width:12px}
.tpl-sheet td.nb,.tpl-sheet th.nb{border:1px dotted #cbd5e1}
.tpl-sheet ol,.tpl-sheet ul{margin:2px 0;padding-left:18px}
`;

/** Стили бланка (<style>…</style>) держим отдельно, а в визуальном редакторе показываем только разметку. */
function split(html: string) {
  const styles: string[] = [];
  const body = html.replace(/<style>([\s\S]*?)<\/style>/g, (_, css: string) => {
    styles.push(css);
    return "";
  });
  return { css: styles.join("\n"), body };
}
const scopeCss = (css: string) => css.replace(/(^|\})\s*\.([\w-]+)/g, "$1 .tpl-sheet .$2");

const ITEMS_TABLE =
  '<table class="wp-table"><tr><td><p><strong>№</strong></p></td><td><p><strong>Наименование</strong></p></td><td><p><strong>Кол-во</strong></p></td><td><p><strong>Цена</strong></p></td><td><p><strong>Сумма</strong></p></td></tr>' +
  "<tr><td><p>&lt;№&gt;</p></td><td><p>&lt;Наименование&gt;</p></td><td><p>&lt;Кол&gt;</p></td><td><p>&lt;Цена&gt;</p></td><td><p>&lt;Сумма&gt;</p></td></tr></table><p></p>";

export function TemplateEditor({ initial, groups, widthMm, formats }: { initial: string; groups: Group[]; widthMm: number; formats: readonly (readonly [string, string])[] }) {
  const first = split(initial);
  const [css, setCss] = useState(first.css);
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [code, setCode] = useState(initial);
  const [open, setOpen] = useState<string | null>(groups[0]?.title ?? null);
  const ed = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  const current = () => (mode === "html" ? code : (css ? `<style>${css}</style>` : "") + (ed.current?.innerHTML ?? ""));
  const sync = () => {
    if (hidden.current) hidden.current.value = current();
  };

  useEffect(() => {
    if (ed.current) ed.current.innerHTML = first.body;
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (m: "visual" | "html") => {
    if (m === mode) return;
    if (m === "html") setCode(current());
    else {
      const s = split(code);
      setCss(s.css);
      requestAnimationFrame(() => {
        if (ed.current) ed.current.innerHTML = s.body;
        sync();
      });
    }
    setMode(m);
  };

  const cmd = (c: string, v?: string) => {
    ed.current?.focus();
    document.execCommand(c, false, v);
    sync();
  };
  const insertVar = (name: string) => {
    if (mode === "html") {
      setCode((c) => c + `&lt;${name}&gt;`);
      return;
    }
    cmd("insertText", `<${name}>`);
  };

  const B = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="rounded p-1.5 text-slate-600 hover:bg-slate-200">
      {children}
    </button>
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
      <input type="hidden" name="html" ref={hidden} />
      <div className="min-w-0">
        <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {mode === "visual" && (
            <>
              <B title="Жирный" onClick={() => cmd("bold")}>
                <Bold size={16} />
              </B>
              <B title="Курсив" onClick={() => cmd("italic")}>
                <Italic size={16} />
              </B>
              <B title="Подчёркнутый" onClick={() => cmd("underline")}>
                <Underline size={16} />
              </B>
              <select title="Размер текста" className="rounded border border-slate-200 bg-white px-1 py-1 text-xs" defaultValue="" onChange={(e) => (cmd("fontSize", e.target.value), (e.target.value = ""))}>
                <option value="" disabled>
                  Размер
                </option>
                <option value="1">мелкий</option>
                <option value="2">малый</option>
                <option value="3">обычный</option>
                <option value="4">крупный</option>
                <option value="5">большой</option>
                <option value="6">заголовок</option>
              </select>
              <select title="Абзац" className="rounded border border-slate-200 bg-white px-1 py-1 text-xs" defaultValue="" onChange={(e) => (cmd("formatBlock", e.target.value), (e.target.value = ""))}>
                <option value="" disabled>
                  Абзац
                </option>
                <option value="p">Текст</option>
                <option value="h1">Заголовок 1</option>
                <option value="h2">Заголовок 2</option>
                <option value="h3">Заголовок 3</option>
              </select>
              <B title="Влево" onClick={() => cmd("justifyLeft")}>
                <AlignLeft size={16} />
              </B>
              <B title="По центру" onClick={() => cmd("justifyCenter")}>
                <AlignCenter size={16} />
              </B>
              <B title="Вправо" onClick={() => cmd("justifyRight")}>
                <AlignRight size={16} />
              </B>
              <B title="Список" onClick={() => cmd("insertOrderedList")}>
                <List size={16} />
              </B>
              <B title="Линия" onClick={() => cmd("insertHorizontalRule")}>
                <Minus size={16} />
              </B>
              <B title="Таблица позиций (строка повторяется для каждого товара/работы)" onClick={() => cmd("insertHTML", ITEMS_TABLE)}>
                <Table size={16} />
              </B>
            </>
          )}
          <div className="ml-auto flex gap-1">
            <button type="button" onClick={() => switchMode("visual")} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${mode === "visual" ? "bg-white shadow" : "text-slate-600"}`}>
              <Eye size={14} /> Визуально
            </button>
            <button type="button" onClick={() => switchMode("html")} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${mode === "html" ? "bg-white shadow" : "text-slate-600"}`}>
              <Code size={14} /> HTML
            </button>
          </div>
        </div>
        <style dangerouslySetInnerHTML={{ __html: BASE + scopeCss(css) }} />
        <div className="overflow-auto rounded-lg bg-slate-200 p-4">
          <div
            ref={ed}
            contentEditable={mode === "visual"}
            suppressContentEditableWarning
            onInput={sync}
            onBlur={sync}
            className={`tpl-sheet mx-auto min-h-64 p-4 shadow outline-none ${mode === "visual" ? "" : "hidden"}`}
            style={{ width: `${widthMm}mm`, maxWidth: "100%" }}
          />
          {mode === "html" && (
            <textarea
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (hidden.current) hidden.current.value = e.target.value;
              }}
              spellCheck={false}
              className="h-[60vh] w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs"
            />
          )}
        </div>
      </div>
      <aside className="space-y-2 text-sm">
        <div className="font-medium text-slate-700">Переменные</div>
        <p className="text-xs text-slate-500">Нажмите, чтобы вставить в место курсора. При печати заменятся данными документа.</p>
        {groups.map((g) => (
          <div key={g.title} className="rounded-lg border border-slate-200">
            <button type="button" onClick={() => setOpen(open === g.title ? null : g.title)} className="w-full px-3 py-1.5 text-left font-medium text-slate-700">
              {g.title}
            </button>
            {open === g.title && (
              <div className="flex flex-wrap gap-1 border-t border-slate-100 p-2">
                {g.vars.map((v) => (
                  <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v)} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 hover:bg-blue-100">
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
          <div className="mb-1 font-medium text-slate-600">Форматы</div>
          {formats.map(([f, d]) => (
            <div key={f}>
              <code>{f}</code> — {d}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
