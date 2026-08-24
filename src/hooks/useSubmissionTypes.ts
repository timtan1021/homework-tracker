import type { SubmissionType } from "../db/schema";
import { listSubmissionTypes } from "../db/submissionTypes";
import { useAsync, type AsyncState } from "./useAsync";

export function useSubmissionTypes(
  cohortId: string,
): AsyncState<SubmissionType[]> & { reload: () => void } {
  return useAsync(
    () => listSubmissionTypes(cohortId),
    `submission-types:${cohortId}`,
  );
}
