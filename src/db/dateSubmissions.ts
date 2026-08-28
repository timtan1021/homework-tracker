import { newId } from "../lib/id";
import { ValidationError } from "./errors";
import { getDb, type SubmissionType } from "./schema";

function assertValidName(name: string): void {
  if (name.trim() === "") {
    throw new ValidationError("宿題の名前を入力してください");
  }
}

/** "YYYY-MM-DD" のみ受け付ける。input type="date" の値がこの形式。 */
function assertValidDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError("日付を選んでください");
  }
}

/** "HH:mm" のみ受け付ける。input type="time" の値がこの形式。 */
function assertValidDeadline(deadline: string): void {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(deadline);
  if (match === null) {
    throw new ValidationError("締切時刻を入力してください");
  }
}

export async function addDateSubmission(input: {
  cohortId: string;
  name: string;
  date: string;
  deadline: string;
}): Promise<SubmissionType> {
  assertValidName(input.name);
  assertValidDate(input.date);
  assertValidDeadline(input.deadline);

  const db = await getDb();
  const type: SubmissionType = {
    id: newId(),
    cohortId: input.cohortId,
    name: input.name.trim(),
    deadline: input.deadline,
    weekdays: [],
    date: input.date,
    status: "active",
    order: 0,
    createdAt: Date.now(),
  };

  await db.put("submissionTypes", type);
  return type;
}

export async function updateDateSubmissionName(
  id: string,
  name: string,
): Promise<void> {
  assertValidName(name);

  const db = await getDb();
  const current = await db.get("submissionTypes", id);
  if (current === undefined) {
    throw new ValidationError("この宿題は見つかりません");
  }

  await db.put("submissionTypes", { ...current, name: name.trim() });
}

/** 完全削除。曜日繰り返しの「終了」に相当する履歴保持の状態は持たない。 */
export async function deleteDateSubmission(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("submissionTypes", id);
}

/** 対象週(渡された日付キーの集合)に登録済みの日付指定項目を、日付・登録順で返す。 */
export async function listDateSubmissionsInWeek(
  cohortId: string,
  weekDates: string[],
): Promise<SubmissionType[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("submissionTypes", "by-cohort", cohortId);
  const weekSet = new Set(weekDates);

  return all
    .filter((type) => type.date !== undefined && weekSet.has(type.date))
    .sort(
      (a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "") || a.createdAt - b.createdAt,
    );
}
