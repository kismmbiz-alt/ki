"use client";

import { useState } from "react";
import { btn } from "./ui";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`${btn("secondary")} !px-2 !py-1 text-xs`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt("Скопируйте ссылку", text);
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? "Скопировано" : "Копировать"}
    </button>
  );
}
