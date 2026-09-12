import { isPastDeadline } from "../lib/date";
import type { Student, SubmissionType } from "./schema";
import { listStudents } from "./students";
import { isDueOn, listSubmissionTypes } from "./submissionTypes";
import { listSubmissions } from "./submissions";

export type CellState = "submitted" | "absent" | "none";

export type DailyRosterColumn = {
  type: SubmissionType;
  /** 対象日の締切を、現在時刻の時点で過ぎているか。 */
  deadlinePassed: boolean;
  submittedCount: number;
};

export type DailyRosterRow = {
  student: Student;
  /** key は type.id。その日が提出日の提出物ぶんだけ入る。 */
  cells: Record<string, CellState>;
};

export type DailyRoster = {
  columns: DailyRosterColumn[];
  rows: DailyRosterRow[];
  activeCount: number;
};

/**
 * その日の提出チェック表。縦に在籍生徒、横にその日が提出日の提出物。
 *
 * 「未提出者だけ」ではなく全員の状態を返す。先生が「誰が出して誰が
 * 出していないか」を1画面で見るための形。status の無い旧レコードは
 * 提出済み扱い(既存の後方互換と同じ)。
 */
export async function listDailyRoster(
  cohortId: string,
  date: string,
  now: Date,
): Promise<DailyRoster> {
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

  const stateByKey = new Map<string, CellState>();
  for (const submission of submissions) {
    stateByKey.set(
      `${submission.studentId}|${submission.submissionTypeId}`,
      submission.status === "absent" ? "absent" : "submitted",
    );
  }

  const rows: DailyRosterRow[] = activeStudents.map((student) => {
    const cells: Record<string, CellState> = {};
    for (const type of dueTypes) {
      cells[type.id] = stateByKey.get(`${student.id}|${type.id}`) ?? "none";
    }
    return { student, cells };
  });

  const columns: DailyRosterColumn[] = dueTypes.map((type) => ({
    type,
    deadlinePassed: isPastDeadline(date, type.deadline, now),
    submittedCount: rows.filter((row) => row.cells[type.id] === "submitted")
      .length,
  }));

  return { columns, rows, activeCount: activeStudents.length };
}
