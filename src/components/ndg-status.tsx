import type { NdgStatus } from "@/lib/services/ndg";

/**
 * Status limitu zawsze niesie ikonę i podpis — kolor sam z siebie nic nie
 * znaczy (część odcieni ma na białym tle kontrast poniżej 3:1, a część
 * czytelników nie rozróżnia hue).
 */
export const NDG_STATUS: Record<
  NdgStatus,
  {
    label: string;
    icon: string;
    fill: string;
    track: string;
    tone: string;
    border: string;
    text: string;
  }
> = {
  OK: {
    label: "W normie",
    icon: "✓",
    fill: "var(--color-status-good)",
    track: "var(--color-status-good-track)",
    tone: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-900",
  },
  WATCH: {
    label: "Obserwuj",
    icon: "◔",
    fill: "var(--color-status-warning)",
    track: "var(--color-status-warning-track)",
    tone: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-900",
  },
  WARNING: {
    label: "Limit się zbliża",
    icon: "⚠",
    fill: "var(--color-status-serious)",
    track: "var(--color-status-serious-track)",
    tone: "bg-orange-50",
    border: "border-orange-300",
    text: "text-orange-900",
  },
  EXCEEDED: {
    label: "Limit przekroczony",
    icon: "✕",
    fill: "var(--color-status-critical)",
    track: "var(--color-status-critical-track)",
    tone: "bg-red-50",
    border: "border-red-300",
    text: "text-red-900",
  },
  UNKNOWN: {
    label: "Brak kwoty limitu",
    icon: "?",
    fill: "var(--color-gridline)",
    track: "var(--color-gridline)",
    tone: "bg-slate-50",
    border: "border-slate-300",
    text: "text-slate-800",
  },
};

export function NdgStatusChip({ status }: { status: NdgStatus }) {
  const style = NDG_STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${style.tone} ${style.border} ${style.text}`}
    >
      <span aria-hidden="true">{style.icon}</span>
      {style.label}
    </span>
  );
}
