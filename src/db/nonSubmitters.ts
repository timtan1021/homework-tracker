import {
  isPastDeadline,
  recentDateKeys,
  toDateKey,
  weekdayOfDateKey,
} from "../lib/date";
import type { Student, SubmissionType } from "./schema";
import { getDb } from "./schema";
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

export type NonSubmissionCount = {
  student: Student;
  count: number;
};

/**
 * 直近 days 日間で、生徒ごとに何回未提出があったかを数える。
 *
 * 対象は現在アクティブな提出物のみ(終了した提出物について声をかける
 * 意味は無い)。カウント0の生徒は結果に含めない。多い順、同数なら
 * 出席番号昇順。
 */
export async function countRecentNonSubmissions(
  cohortId: string,
  endDate: string,
  now: Date,
  days: number,
): Promise<NonSubmissionCount[]> {
  const dates = recentDateKeys(endDate, days);

  const db = await getDb();
  const [students, types, submissions] = await Promise.all([
    listStudents(cohortId),
    listSubmissionTypes(cohortId),
    db.getAllFromIndex(
      "submissions",
      "by-cohort-date",
      IDBKeyRange.bound([cohortId, dates[0]], [cohortId, endDate]),
    ),
  ]);

  const activeStudents = students.filter(
    (student) => student.status === "active",
  );
  const activeTypes = types.filter((type) => type.status === "active");

  const submittedKeys = new Set(
    submissions.map(
      (submission) =>
        `${submission.date}|${submission.studentId}|${submission.submissionTypeId}`,
    ),
  );

  const counts = new Map<string, number>();
  for (const date of dates) {
    const weekday = weekdayOfDateKey(date);

    for (const type of activeTypes) {
      if (!type.weekdays.includes(weekday)) {
        continue;
      }
      // 提出物が作られる前の日付は、その提出物についてカウントしない。
      if (date < toDateKey(new Date(type.createdAt))) {
        continue;
      }
      if (!isPastDeadline(date, type.deadline, now)) {
        continue;
      }

      for (const student of activeStudents) {
        const key = `${date}|${student.id}|${type.id}`;
        if (!submittedKeys.has(key)) {
          counts.set(student.id, (counts.get(student.id) ?? 0) + 1);
        }
      }
    }
  }

  return activeStudents
    .map((student) => ({ student, count: counts.get(student.id) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.student.attendanceNumber - b.student.attendanceNumber,
    );
}
