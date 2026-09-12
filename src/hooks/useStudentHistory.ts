import { getStudentHistory, type StudentHistory } from "../db/studentHistory";
import { useAsync, type AsyncState } from "./useAsync";

export function useStudentHistory(
  studentId: string,
): AsyncState<StudentHistory | null> & { reload: () => void } {
  return useAsync(
    () => getStudentHistory(studentId),
    `student-history:${studentId}`,
  );
}
