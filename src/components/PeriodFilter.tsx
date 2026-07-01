"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

const PRESETS = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "Este año", days: 365 },
  { label: "Todo", days: 0 },
];

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

export function PeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentFrom = searchParams.get("from") ?? "";
  const currentTo = searchParams.get("to") ?? "";

  function navigate(params: URLSearchParams) {
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function applyPreset(days: number) {
    const p = new URLSearchParams();
    if (days > 0) {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - days);
      p.set("from", toDateStr(from));
      p.set("to", toDateStr(to));
    }
    navigate(p);
  }

  function applyCustom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    const from = String(fd.get("from") ?? "");
    const to = String(fd.get("to") ?? "");
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    navigate(p);
  }

  // Detect which preset is active
  const activePreset =
    !currentFrom && !currentTo
      ? 0
      : (() => {
          if (!currentFrom || !currentTo) return -1;
          const diff = Math.round(
            (new Date(currentTo).getTime() - new Date(currentFrom).getTime()) /
              86400000
          );
          return PRESETS.find((p) => p.days > 0 && Math.abs(p.days - diff) <= 1)
            ?.days ?? -1;
        })();

  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        flexWrap: "wrap",
        opacity: isPending ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {PRESETS.map((preset) => {
        const isActive = activePreset === preset.days;
        return (
          <button
            key={preset.days}
            onClick={() => applyPreset(preset.days)}
            style={{
              padding: "0.3rem 0.7rem",
              fontSize: "0.78rem",
              fontWeight: isActive ? 600 : 400,
              fontFamily: "inherit",
              borderRadius: "6px",
              cursor: "pointer",
              border: `1px solid ${isActive ? "rgba(247,147,26,0.4)" : "var(--border)"}`,
              background: isActive ? "var(--accent-dim)" : "var(--surface2)",
              color: isActive ? "var(--accent)" : "var(--text-secondary)",
              transition: "all 0.15s",
            }}
          >
            {preset.label}
          </button>
        );
      })}

      <form
        onSubmit={applyCustom}
        style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}
      >
        <input
          type="date"
          name="from"
          defaultValue={currentFrom}
          className="form-input"
          style={{ width: "140px", padding: "0.3rem 0.5rem", fontSize: "0.78rem" }}
        />
        <span style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>→</span>
        <input
          type="date"
          name="to"
          defaultValue={currentTo}
          className="form-input"
          style={{ width: "140px", padding: "0.3rem 0.5rem", fontSize: "0.78rem" }}
        />
        <button
          type="submit"
          style={{
            padding: "0.3rem 0.65rem",
            fontSize: "0.78rem",
            fontFamily: "inherit",
            fontWeight: 500,
            borderRadius: "6px",
            cursor: "pointer",
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            color: "var(--text)",
          }}
        >
          Aplicar
        </button>
      </form>
    </div>
  );
}
