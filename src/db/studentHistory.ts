import { getDb } from "./schema";
import type { Student, Submission } from "./schema";
import { listSubmissionsForStudent } from "./submissions";
import { listSubmissionTypes } from "./submissionTypes";

export const DELETED_TYPE_LABEL = "(削除された提出物)";

export type StudentHistoryEntry = {
  submission: Submission;
  typeName: string;
};

export type StudentHistory = {
  student: Student;
  entries: StudentHistoryEntry[];
};

/**
 * 1人の生徒の提出記録を、提出物名を添えて日付の新しい順で返す。
 *
 * 提出物が完全に削除されていても記録自体は残る(deleteSubmissionTypeは
 * submissionsを連動して消さない)ため、名前が引けない場合は
 * DELETED_TYPE_LABEL で埋める。閲覧専用の履歴なので、採点画面と違って
 * 該当レコードを除外しない。
 */
export async function getStudentHistory(
  studentId: string,
): Promise<StudentHistory | null> {
  const db = await getDb();
  const student = await db.get("students", studentId);
  if (student === undefined) {
    return null;
  }

  const [submissions, types] = await Promise.all([
    listSubmissionsForStudent(studentId),
    listSubmissionTypes(student.cohortId),
  ]);

  const nameById = new Map(types.map((type) => [type.id, type.name]));
  const entries = submissions.map((submission) => ({
    submission,
    typeName: nameById.get(submission.submissionTypeId) ?? DELETED_TYPE_LABEL,
  }));

  return { student, entries };
}
