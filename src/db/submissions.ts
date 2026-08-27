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
 * すでに提出済みのものは飛ばし、未記録のものと欠席の記録は上書きする。
 * 欠席の記録は既存のidを再利用して上書きすることで、by-unique制約違反を
 * 回避する。二度目の呼び出しで submittedAt を上書きしないのは、締切前に
 * 出した生徒が先生の再スキャンで遅刻扱いにならないようにするため。
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

  // 欠席の記録は上書き対象(既存のidを再利用してputする。by-uniqueは
  // 一意制約なので、新しいidで別レコードを足そうとすると同期的に
  // ConstraintErrorが投げられる)。提出済みの記録はスキップする。
  const toWrite: { submissionTypeId: string; existingId: string | undefined }[] =
    [];
  for (const submissionTypeId of input.submissionTypeIds) {
    const existing = await index.get([
      input.date,
      input.studentId,
      submissionTypeId,
    ]);
    if (existing === undefined || existing.status === "absent") {
      toWrite.push({ submissionTypeId, existingId: existing?.id });
    }
  }

  const submittedAt = Date.now();
  await Promise.all(
    toWrite.map(({ submissionTypeId, existingId }) =>
      tx.store.put({
        id: existingId ?? newId(),
        cohortId: input.cohortId,
        studentId: input.studentId,
        submissionTypeId,
        date: input.date,
        submittedAt,
        status: "submitted",
      }),
    ),
  );
  await tx.done;

  return toWrite.length > 0
    ? { kind: "recorded", student }
    : { kind: "already", student };
}

export type MarkAbsentResult = { kind: "marked" } | { kind: "alreadyRecorded" };

/**
 * 生徒を欠席として記録する。未提出者一覧の未マークセルからのみ呼ばれる想定だが、
 * 既に記録があれば書き込まずに alreadyRecorded を返す(念のための防御)。
 */
export async function markAbsent(input: {
  cohortId: string;
  studentId: string;
  submissionTypeId: string;
  date: string;
}): Promise<MarkAbsentResult> {
  const db = await getDb();
  const tx = db.transaction("submissions", "readwrite");
  const index = tx.store.index("by-unique");

  const existing = await index.get([
    input.date,
    input.studentId,
    input.submissionTypeId,
  ]);
  if (existing !== undefined) {
    await tx.done;
    return { kind: "alreadyRecorded" };
  }

  await tx.store.put({
    id: newId(),
    cohortId: input.cohortId,
    studentId: input.studentId,
    submissionTypeId: input.submissionTypeId,
    date: input.date,
    submittedAt: Date.now(),
    status: "absent",
  });
  await tx.done;
  return { kind: "marked" };
}

/**
 * 欠席マークを取り消す。status が "absent" の記録だけを消す。
 * 実提出の記録を誤って消さないための防御。
 */
export async function unmarkAbsent(input: {
  studentId: string;
  submissionTypeId: string;
  date: string;
}): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("submissions", "readwrite");
  const index = tx.store.index("by-unique");

  const existing = await index.get([
    input.date,
    input.studentId,
    input.submissionTypeId,
  ]);
  if (existing !== undefined && existing.status === "absent") {
    await tx.store.delete(existing.id);
  }
  await tx.done;
}
