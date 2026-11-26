"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

const split = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Поле с «плашками»: несколько значений из справочника или свои.
 * В форму уходит одна строка через запятую (name).
 */
export function TagInput({
  name,
  defaultValue,
  options,
  placeholder,
  required,
}: {
  name: string;
  defaultValue?: string | null;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  const [tags, setTags] = useState<string[]>(() => split(defaultValue ?? ""));
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const lower = tags.map((t) => t.toLowerCase());
  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    return options.filter((o) => !lower.includes(o.toLowerCase()) && (!q || o.toLowerCase().includes(q))).slice(0, 10);
  }, [options, text, lower]);

  const add = (v: string) => {
    const vals = split(v).filter((x) => !lower.includes(x.toLowerCase()));
    if (vals.length) setTags([...tags, ...vals]);
    setText("");
  };
  const value = [...tags, ...(text.trim() ? [text.trim()] : [])].join(", ");

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <div
        className={`flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 ${focus ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}
      >
        {tags.map((t, i) => (
          <span key={t + i} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-sm text-blue-700 ring-1 ring-blue-200">
            {t}
            <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} className="text-blue-500 hover:text-red-500" aria-label="Убрать">
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
            } else if (e.key === "Backspace" && !text && tags.length) setTags(tags.slice(0, -1));
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          placeholder={tags.length ? "" : placeholder}
          required={required && !tags.length}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>
      {focus && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Одно значение с подсказками из справочника. */
export function ComboInput({
  name,
  defaultValue,
  options,
  placeholder,
  required,
}: {
  name: string;
  defaultValue?: string | null;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  const [text, setText] = useState(defaultValue ?? "");
  const [focus, setFocus] = useState(false);
  const list = useMemo(() => {
    const q = text.trim().toLowerCase();
    return options.filter((o) => (!q || o.toLowerCase().includes(q)) && o !== text).slice(0, 12);
  }, [options, text]);
  return (
    <div className="relative">
      <input
        name={name}
        value={text}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none"
      />
      {focus && list.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {list.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText(s);
                setFocus(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
