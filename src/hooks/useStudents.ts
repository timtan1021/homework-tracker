import type { Student } from "../db/schema";
import { listStudents } from "../db/students";
import { useAsync, type AsyncState } from "./useAsync";

export function useStudents(
  cohortId: string,
): AsyncState<Student[]> & { reload: () => void } {
  return useAsync(() => listStudents(cohortId), `students:${cohortId}`);
}
