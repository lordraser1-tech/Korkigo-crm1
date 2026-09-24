import Link from "next/link";
import { shiftWeek } from "@/lib/datetime";

export function WeekNav({
  weekKey,
  weekLabel,
  basePath,
  extraQuery = {},
}: {
  weekKey: string;
  weekLabel: string;
  basePath: string;
  extraQuery?: Record<string, string | undefined>;
}) {
  const href = (key: string) => {
    const params = new URLSearchParams({ w: key });
    for (const [name, value] of Object.entries(extraQuery)) {
      if (value) params.set(name, value);
    }
    return `${basePath}?${params.toString()}`;
  };

  return (
    <div className="flex items-center gap-2">
      <Link href={href(shiftWeek(weekKey, -1))} className="btn-secondary btn-sm">
        ← Poprzedni
      </Link>
      <span className="min-w-48 text-center text-sm font-semibold text-slate-700">
        {weekLabel}
      </span>
      <Link href={href(shiftWeek(weekKey, 1))} className="btn-secondary btn-sm">
        Następny →
      </Link>
    </div>
  );
}
