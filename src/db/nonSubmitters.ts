import {
  isPastDeadline,
  recentDateKeys,
  toDateKey,
} from "../lib/date";
import type { Student, SubmissionType } from "./schema";
import { getDb } from "./schema";
import { listStudents } from "./students";
import { isDueOn, listSubmissionTypes } from "./submissionTypes";
import { listSubmissions } from "./submissions";

export type TodayNonSubmitterGroup = {
  type: SubmissionType;
  /** 対象日の締切を、現在時刻の時点で過ぎているか。 */
  deadlinePassed: boolean;
  /** 記録の無い、または欠席とマークされた在籍生徒。出席番号順。 */
  students: { student: Student; status: "unmarked" | "absent" }[];
};

/** 今日が提出日のアクティブな提出物ごとに、まだ提出していない在籍生徒を返す。 */
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

  const dueTypes = types.filter(
    (type) => type.status === "active" && isDueOn(type, date),
  );

  return dueTypes.map((type) => {
    const byStudent = new Map(
      submissions
        .filter((submission) => submission.submissionTypeId === type.id)
        .map((submission) => [submission.studentId, submission] as const),
    );

    const nonSubmitters: { student: Student; status: "unmarked" | "absent" }[] =
      [];
    for (const student of activeStudents) {
      const submission = byStudent.get(student.id);
      // statusの無い旧レコードは提出済み扱い(既存レコードとの後方互換)。
      if (submission !== undefined && submission.status !== "absent") {
        continue;
      }
      nonSubmitters.push({
        student,
        status: submission === undefined ? "unmarked" : "absent",
      });
    }

    return {
      type,
      deadlinePassed: isPastDeadline(date, type.deadline, now),
      students: nonSubmitters,
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
    for (const type of activeTypes) {
      if (!isDueOn(type, date)) {
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
