import { Link } from "react-router";
import type { Cohort } from "../db/schema";

export function AppHeader({
  cohort,
  subtitle,
}: {
  cohort: Cohort;
  subtitle: string;
}) {
  return (
    <header className="border-kogan flex items-start justify-between gap-3 border-b pb-3">
      <div>
        <h1 className="font-display text-ai text-2xl">
          {cohort.year}年度 {cohort.className}
        </h1>
        <p className="mt-1 text-sm">{subtitle}</p>
      </div>
      {/* タブレットを片手で持って押すため、44px四方のタップ領域を確保する */}
      <Link
        to="/settings"
        aria-label="設定"
        className="text-ai flex size-11 shrink-0 items-center justify-center text-xl"
      >
        ⚙
      </Link>
    </header>
  );
}
