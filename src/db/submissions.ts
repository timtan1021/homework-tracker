import { newId } from "../lib/id";
import { getDb, type Student, type Submission } from "./schema";

export type RecordResult =
  | { kind: "recorded"; student: Student }
  | { kind: "already"; student: Student }
  | { kind: "transferredOut"; student: Student }
  | { kind: "notFound" };

export async function listSubmissions(
  cohortId: string,
  date: string,
): Promise<Submission[]> {
  const db = await getDb();
  return db.getAllFromIndex("submissions", "by-cohort-date", [cohortId, date]);
}

/** その日の提出物ごとの人数。記録が無い提出物はキーごと含まない。 */
export async function countByType(
  cohortId: string,
  date: string,
): Promise<Map<string, number>> {
  const submissions = await listSubmissions(cohortId, date);

  const counts = new Map<string, number>();
  for (const submission of submissions) {
    counts.set(
      submission.submissionTypeId,
      (counts.get(submission.submissionTypeId) ?? 0) + 1,
    );
  }
  return counts;
}

/**
 * 提出を記録する。カメラにも画面にも依存しない。
 *
 * すでに記録済みのものは飛ばし、未記録のものだけ足す。二度目の
 * 呼び出しで submittedAt を上書きしないのは、締切前に出した生徒が
 * 先生の再スキャンで遅刻扱いにならないようにするため。
 */
export async function recordSubmission(input: {
  cohortId: string;
  studentId: string;
  submissionTypeIds: string[];
  date: string;
}): Promise<RecordResult> {
  const db = await getDb();

  const student = await db.get("students", input.studentId);
  if (student === undefined || student.cohortId !== input.cohortId) {
    return { kind: "notFound" };
  }
  if (student.status === "transferredOut") {
    return { kind: "transferredOut", student };
  }

  const tx = db.transaction("submissions", "readwrite");
  const index = tx.store.index("by-unique");

  const missing: string[] = [];
  for (const submissionTypeId of input.submissionTypeIds) {
    const existing = await index.get([
      input.date,
      input.studentId,
      submissionTypeId,
    ]);
    if (existing === undefined) {
      missing.push(submissionTypeId);
    }
  }

  const submittedAt = Date.now();
  await Promise.all(
    missing.map((submissionTypeId) =>
      tx.store.put({
        id: newId(),
        cohortId: input.cohortId,
        studentId: input.studentId,
        submissionTypeId,
        date: input.date,
        submittedAt,
      }),
    ),
  );
  await tx.done;

  return missing.length > 0
    ? { kind: "recorded", student }
    : { kind: "already", student };
}
