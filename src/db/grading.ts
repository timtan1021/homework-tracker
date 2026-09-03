import { toDateKey } from "../lib/date";
import { getDb } from "./schema";
import type { Student, Submission, SubmissionType } from "./schema";
import { listStudents } from "./students";
import { listSubmissionTypes } from "./submissionTypes";

export type GradingItem = {
  submission: Submission;
  student: Student;
  type: SubmissionType;
};

/** 欠席以外の全提出記録を、日付を問わず返す。新しいインデックスは使わない。 */
async function listGradableSubmissions(cohortId: string): Promise<Submission[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(
    "submissions",
    "by-cohort-date",
    IDBKeyRange.bound([cohortId, ""], [cohortId, "\uffff"]),
  );
  return all.filter((submission) => submission.status !== "absent");
}

function compareGradingItems(a: GradingItem, b: GradingItem): number {
  return (
    a.type.order - b.type.order ||
    a.submission.date.localeCompare(b.submission.date) ||
    a.student.attendanceNumber - b.student.attendanceNumber
  );
}

/**
 * 未採点・再提出待ちの提出記録を、提出物の表示順→日付→出席番号でまとめて返す。
 * 転出した生徒、削除済みの提出物に紐づく記録は含めない。
 *
 * 未採点(ungraded)は受け取った日(submittedAtをローカルで日付に切ったもの)で
 * receivedDate に絞る。提出日ではなく受け取った日で絞るのは、採点が
 * 「今日手元にあるドリルを見る」作業だから(過去の提出日で遅れて提出された
 * ものも、受け取った今日の欄に出す)。
 *
 * 再提出待ち(resubmitPending)は絞らない。日をまたいで追いかけるものなので、
 * 絞ると見失う。
 */
export async function listGradingItems(
  cohortId: string,
  receivedDate: string,
): Promise<{
  ungraded: GradingItem[];
  resubmitPending: GradingItem[];
  otherDaysUngradedCount: number;
  oldestUngradedDate: string | null;
}> {
  const [submissions, students, types] = await Promise.all([
    listGradableSubmissions(cohortId),
    listStudents(cohortId),
    listSubmissionTypes(cohortId),
  ]);

  const studentMap = new Map(
    students.filter((s) => s.status === "active").map((s) => [s.id, s]),
  );
  const typeMap = new Map(types.map((t) => [t.id, t]));

  const items: GradingItem[] = [];
  for (const submission of submissions) {
    const student = studentMap.get(submission.studentId);
    const type = typeMap.get(submission.submissionTypeId);
    if (student === undefined || type === undefined) {
      continue;
    }
    items.push({ submission, student, type });
  }
  items.sort(compareGradingItems);

  const allUngraded = items.filter((item) => item.submission.grade === undefined);

  const ungradedByReceivedDate = new Map<string, GradingItem[]>();
  for (const item of allUngraded) {
    const received = toDateKey(new Date(item.submission.submittedAt));
    const bucket = ungradedByReceivedDate.get(received);
    if (bucket !== undefined) {
      bucket.push(item);
    } else {
      ungradedByReceivedDate.set(received, [item]);
    }
  }

  const otherReceivedDates = [...ungradedByReceivedDate.keys()]
    .filter((received) => received !== receivedDate)
    .sort();

  return {
    ungraded: ungradedByReceivedDate.get(receivedDate) ?? [],
    resubmitPending: items.filter(
      (item) => item.submission.grade === "resubmit",
    ),
    otherDaysUngradedCount: otherReceivedDates.reduce(
      (total, received) =>
        total + (ungradedByReceivedDate.get(received)?.length ?? 0),
      0,
    ),
    oldestUngradedDate: otherReceivedDates[0] ?? null,
  };
}

export async function gradeSubmission(
  id: string,
  grade: "passed" | "resubmit",
): Promise<void> {
  const db = await getDb();
  const current = await db.get("submissions", id);
  if (current === undefined) {
    return;
  }
  await db.put("submissions", { ...current, grade });
}

/** 未採点に戻す。grade フィールドごと外す。 */
export async function clearGrade(id: string): Promise<void> {
  const db = await getDb();
  const current = await db.get("submissions", id);
  if (current === undefined) {
    return;
  }
  const { grade: _grade, ...rest } = current;
  await db.put("submissions", rest);
}
