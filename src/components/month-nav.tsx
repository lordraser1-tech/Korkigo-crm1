import Link from "next/link";
import { formatMonthLabel, shiftMonth } from "@/lib/datetime";

export function MonthNav({
  monthKey,
  basePath,
  extraQuery = {},
}: {
  monthKey: string;
  basePath: string;
  extraQuery?: Record<string, string | undefined>;
}) {
  const href = (key: string) => {
    const params = new URLSearchParams({ m: key });
    for (const [name, value] of Object.entries(extraQuery)) {
      if (value) params.set(name, value);
    }
    return `${basePath}?${params.toString()}`;
  };

  return (
    <div className="flex items-center gap-2">
      <Link href={href(shiftMonth(monthKey, -1))} className="btn-secondary btn-sm">
        ← Poprzedni
      </Link>
      <span className="min-w-36 text-center text-sm font-semibold capitalize text-slate-700">
        {formatMonthLabel(monthKey)}
      </span>
      <Link href={href(shiftMonth(monthKey, 1))} className="btn-secondary btn-sm">
        Następny →
      </Link>
    </div>
  );
}
