import type { GradingItem } from "../db/grading";
import { listGradingItems } from "../db/grading";
import { useAsync, type AsyncState } from "./useAsync";

export function useGradingItems(cohortId: string): AsyncState<{
  ungraded: GradingItem[];
  resubmitPending: GradingItem[];
}> & { reload: () => void } {
  return useAsync(
    () => listGradingItems(cohortId),
    `grading-items:${cohortId}`,
  );
}
