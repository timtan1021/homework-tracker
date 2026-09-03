import type { GradingItem } from "../db/grading";
import { listGradingItems } from "../db/grading";
import { useAsync, type AsyncState } from "./useAsync";

export function useGradingItems(
  cohortId: string,
  receivedDate: string,
): AsyncState<{
  ungraded: GradingItem[];
  resubmitPending: GradingItem[];
  otherDaysUngradedCount: number;
  oldestUngradedDate: string | null;
}> & { reload: () => void } {
  return useAsync(
    () => listGradingItems(cohortId, receivedDate),
    `grading-items:${cohortId}:${receivedDate}`,
  );
}
