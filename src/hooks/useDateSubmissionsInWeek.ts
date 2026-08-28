import type { SubmissionType } from "../db/schema";
import { listDateSubmissionsInWeek } from "../db/dateSubmissions";
import { weekDates } from "../lib/date";
import { useAsync, type AsyncState } from "./useAsync";

export function useDateSubmissionsInWeek(
  cohortId: string,
  weekStart: string,
): AsyncState<SubmissionType[]> & { reload: () => void } {
  return useAsync(
    () => listDateSubmissionsInWeek(cohortId, weekDates(weekStart)),
    `date-submissions:${cohortId}:${weekStart}`,
  );
}
