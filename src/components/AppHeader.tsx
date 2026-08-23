import type { Cohort } from "../db/schema";

export function AppHeader({
  cohort,
  subtitle,
}: {
  cohort: Cohort;
  subtitle: string;
}) {
  return (
    <header className="border-kogan border-b pb-3">
      <h1 className="font-display text-ai text-2xl">
        {cohort.year}年度 {cohort.className}
      </h1>
      <p className="mt-1 text-sm">{subtitle}</p>
    </header>
  );
}
