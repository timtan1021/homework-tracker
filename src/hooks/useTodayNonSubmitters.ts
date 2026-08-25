import type { TodayNonSubmitterGroup } from "../db/nonSubmitters";
import { listTodayNonSubmitters } from "../db/nonSubmitters";
import { useAsync, type AsyncState } from "./useAsync";

export function useTodayNonSubmitters(
  cohortId: string,
  date: string,
  now: Date,
): AsyncState<TodayNonSubmitterGroup[]> & { reload: () => void } {
  return useAsync(
    () => listTodayNonSubmitters(cohortId, date, now),
    `today-non-submitters:${cohortId}:${date}`,
  );
}
