import { listDailyRoster, type DailyRoster } from "../db/dailyRoster";
import { useAsync, type AsyncState } from "./useAsync";

export function useDailyRoster(
  cohortId: string,
  date: string,
  now: Date,
): AsyncState<DailyRoster> & { reload: () => void } {
  return useAsync(
    () => listDailyRoster(cohortId, date, now),
    `daily-roster:${cohortId}:${date}`,
  );
}
