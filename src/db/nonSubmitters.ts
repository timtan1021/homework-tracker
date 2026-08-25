import { isPastDeadline, weekdayOfDateKey } from "../lib/date";
import type { Student, SubmissionType } from "./schema";
import { listStudents } from "./students";
import { listSubmissionTypes } from "./submissionTypes";
import { listSubmissions } from "./submissions";

export type TodayNonSubmitterGroup = {
  type: SubmissionType;
  /** 対象日の締切を、現在時刻の時点で過ぎているか。 */
  deadlinePassed: boolean;
  /** 記録の無い在籍生徒。出席番号順。 */
  students: Student[];
};

/** 今日が提出日のアクティブな提出物ごとに、まだ記録の無い在籍生徒を返す。 */
export async function listTodayNonSubmitters(
  cohortId: string,
  date: string,
  now: Date,
): Promise<TodayNonSubmitterGroup[]> {
  const [students, types, submissions] = await Promise.all([
    listStudents(cohortId),
    listSubmissionTypes(cohortId),
    listSubmissions(cohortId, date),
  ]);

  const activeStudents = students.filter(
    (student) => student.status === "active",
  );

  const weekday = weekdayOfDateKey(date);
  const dueTypes = types.filter(
    (type) => type.status === "active" && type.weekdays.includes(weekday),
  );

  return dueTypes.map((type) => {
    const submittedIds = new Set(
      submissions
        .filter((submission) => submission.submissionTypeId === type.id)
        .map((submission) => submission.studentId),
    );

    return {
      type,
      deadlinePassed: isPastDeadline(date, type.deadline, now),
      students: activeStudents.filter(
        (student) => !submittedIds.has(student.id),
      ),
    };
  });
}
