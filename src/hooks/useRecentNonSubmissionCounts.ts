import type { NonSubmissionCount } from "../db/nonSubmitters";
import { countRecentNonSubmissions } from "../db/nonSubmitters";
import { useAsync, type AsyncState } from "./useAsync";

const RECENT_DAYS = 14;

export function useRecentNonSubmissionCounts(
  cohortId: string,
  endDate: string,
  now: Date,
): AsyncState<NonSubmissionCount[]> & { reload: () => void } {
  return useAsync(
    () => countRecentNonSubmissions(cohortId, endDate, now, RECENT_DAYS),
    `recent-non-submissions:${cohortId}:${endDate}`,
  );
}
