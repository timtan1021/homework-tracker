import type { Submission } from "../db/schema";
import { listSubmissions } from "../db/submissions";
import { useAsync, type AsyncState } from "./useAsync";

export function useSubmissions(
  cohortId: string,
  date: string,
): AsyncState<Submission[]> & { reload: () => void } {
  return useAsync(
    () => listSubmissions(cohortId, date),
    `submissions:${cohortId}:${date}`,
  );
}
