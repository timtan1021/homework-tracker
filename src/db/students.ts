import type { IDBPObjectStore } from "idb";
import { newId } from "../lib/id";
import { ValidationError } from "./errors";
import { getDb, type HomeworkDB, type Student } from "./schema";

type StudentsStore = IDBPObjectStore<
  HomeworkDB,
  ["students"],
  "students",
  "readwrite"
>;

function assertValidNumber(attendanceNumber: number): void {
  if (!Number.isInteger(attendanceNumber) || attendanceNumber < 1) {
    throw new ValidationError("出席番号は1以上の数字で入力してください");
  }
}

const MAX_NAME_LENGTH = 20;

/** 氏名は空文字を許すが、印刷カードや名簿のレイアウトを崩す長さは拒否する。 */
function assertValidName(name: string): void {
  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`氏名は${MAX_NAME_LENGTH}文字以内で入力してください`);
  }
}

/** 番号が空いているか調べる。excludeId は自分自身（編集時）を除外する。 */
async function assertNumberIsFree(
  store: StudentsStore,
  cohortId: string,
  attendanceNumber: number,
  excludeId: string | null,
): Promise<void> {
  const taken = await store
    .index("by-cohort-number")
    .get([cohortId, attendanceNumber]);

  if (taken === undefined || taken.id === excludeId) {
    return;
  }

  throw new ValidationError(
    taken.status === "transferredOut"
      ? `${attendanceNumber}番は転出した生徒の欠番です`
      : `出席番号${attendanceNumber}はすでに使われています`,
  );
}

async function requireStudent(
  store: StudentsStore,
  id: string,
): Promise<Student> {
  const student = await store.get(id);
  if (student === undefined) {
    throw new ValidationError("この生徒は見つかりません");
  }
  return student;
}

export async function listStudents(cohortId: string): Promise<Student[]> {
  const db = await getDb();
  const students = await db.getAllFromIndex("students", "by-cohort", cohortId);
  return students.sort((a, b) => a.attendanceNumber - b.attendanceNumber);
}

export async function getStudent(id: string): Promise<Student | null> {
  const db = await getDb();
  return (await db.get("students", id)) ?? null;
}

/** 転出者を含む最大の出席番号の次を返す。印刷済みのQRと番号がずれないようにするため。 */
export async function nextAttendanceNumber(cohortId: string): Promise<number> {
  const students = await listStudents(cohortId);
  const max = students.reduce(
    (largest, student) => Math.max(largest, student.attendanceNumber),
    0,
  );
  return max + 1;
}

export async function addStudent(input: {
  cohortId: string;
  attendanceNumber: number;
  name?: string;
}): Promise<Student> {
  assertValidNumber(input.attendanceNumber);
  const name = (input.name ?? "").trim();
  assertValidName(name);

  const student: Student = {
    id: newId(),
    cohortId: input.cohortId,
    attendanceNumber: input.attendanceNumber,
    name,
    status: "active",
    createdAt: Date.now(),
  };

  const db = await getDb();
  const tx = db.transaction("students", "readwrite");
  await assertNumberIsFree(tx.store, input.cohortId, input.attendanceNumber, null);
  await tx.store.put(student);
  await tx.done;

  return student;
}

export async function updateStudent(
  id: string,
  changes: { attendanceNumber: number; name: string },
): Promise<Student> {
  assertValidNumber(changes.attendanceNumber);
  assertValidName(changes.name.trim());

  const db = await getDb();
  const tx = db.transaction("students", "readwrite");
  const current = await requireStudent(tx.store, id);

  await assertNumberIsFree(
    tx.store,
    current.cohortId,
    changes.attendanceNumber,
    id,
  );

  const updated: Student = {
    ...current,
    attendanceNumber: changes.attendanceNumber,
    name: changes.name.trim(),
  };
  await tx.store.put(updated);
  await tx.done;

  return updated;
}

async function setStatus(
  id: string,
  status: Student["status"],
): Promise<Student> {
  const db = await getDb();
  const tx = db.transaction("students", "readwrite");
  const current = await requireStudent(tx.store, id);

  const updated: Student = { ...current, status };
  await tx.store.put(updated);
  await tx.done;

  return updated;
}

/** 転出。出席番号は欠番として維持される。 */
export function transferOutStudent(id: string): Promise<Student> {
  return setStatus(id, "transferredOut");
}

export function restoreStudent(id: string): Promise<Student> {
  return setStatus(id, "active");
}

/** 物理削除。出席番号は再利用できるようになる。 */
export async function deleteStudent(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("students", id);
}
