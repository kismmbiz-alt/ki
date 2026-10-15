"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="no-print mb-4 rounded-md bg-blue-600 px-3 py-2 text-sm text-white">
      Печать
    </button>
  );
}
