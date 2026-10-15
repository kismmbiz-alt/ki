"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";
import { btn } from "./ui";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function Form({
  action,
  children,
  className,
  resetOnOk = true,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnOk?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      className={className}
      key={resetOnOk && state?.ok ? state.ok + Math.random() : undefined}
    >
      {children}
      {state?.error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}

export function Submit({ children, variant = "primary", className = "" }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btn(variant)} ${className}`}>
      {pending ? "Сохраняю…" : children}
    </button>
  );
}
