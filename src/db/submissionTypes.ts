import type { IDBPObjectStore } from "idb";
import { weekdayOfDateKey } from "../lib/date";
import { newId } from "../lib/id";
import { ValidationError } from "./errors";
import { getDb, type HomeworkDB, type SubmissionType } from "./schema";

type Store = IDBPObjectStore<
  HomeworkDB,
  ["submissionTypes"],
  "submissionTypes",
  "readwrite"
>;

/** 比較用に名前を正規化する。NFKCで半角カタカナ等の表記ゆれを吸収する。 */
export function normalizeName(name: string): string {
  return name.trim().normalize("NFKC").toLowerCase();
}

function assertValidName(name: string): void {
  if (name.trim() === "") {
    throw new ValidationError("提出物の名前を入力してください");
  }
}

function assertValidDeadline(deadline: string): void {
  // "HH:mm" のみ受け付ける。input type="time" の値がこの形式。
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(deadline);
  if (match === null) {
    throw new ValidationError("締切時刻を入力してください");
  }
}

/** 曜日を昇順・重複なしにする。0〜6以外が混ざっていれば空になる。 */
function normalizeWeekdays(weekdays: number[]): number[] {
  const valid = weekdays.filter(
    (day) => Number.isInteger(day) && day >= 0 && day <= 6,
  );
  return [...new Set(valid)].sort((a, b) => a - b);
}

function assertValidWeekdays(weekdays: number[], normalized: number[]): void {
  // 元の配列に不正な値が含まれていた場合も弾く。
  // 提出日の無い提出物は未提出者一覧に永久に現れず、設定ミスとしか解釈できない。
  if (normalized.length === 0 || normalized.length !== new Set(weekdays).size) {
    throw new ValidationError("提出する曜日を1つ以上選んでください");
  }
}

async function assertNameIsFree(
  store: Store,
  cohortId: string,
  name: string,
  excludeId: string | null,
): Promise<void> {
  const normalized = normalizeName(name);
  // 日付指定の項目(src/db/dateSubmissions.ts経由で追加)は同じストアに同居するが、
  // 「提出物の設定」画面には表示されず名前の衝突を教師が確認できない。
  // 重複チェックの対象から外し、曜日繰り返し側の名前を独立に扱う。
  const existing = (await store.index("by-cohort").getAll(cohortId)).filter(
    (type) => type.date === undefined,
  );

  const taken = existing.find(
    (type) => type.id !== excludeId && normalizeName(type.name) === normalized,
  );
  if (taken === undefined) {
    return;
  }

  throw new ValidationError(
    taken.status === "ended"
      ? `${taken.name}は終了した提出物として登録されています`
      : `${taken.name}はすでに登録されています`,
  );
}

async function requireType(store: Store, id: string): Promise<SubmissionType> {
  const type = await store.get(id);
  if (type === undefined) {
    throw new ValidationError("この提出物は見つかりません");
  }
  return type;
}

export async function listSubmissionTypes(
  cohortId: string,
): Promise<SubmissionType[]> {
  const db = await getDb();
  const types = await db.getAllFromIndex("submissionTypes", "by-cohort", cohortId);
  return types.sort((a, b) => a.order - b.order);
}

export async function getSubmissionType(
  id: string,
): Promise<SubmissionType | null> {
  const db = await getDb();
  return (await db.get("submissionTypes", id)) ?? null;
}

export async function addSubmissionType(input: {
  cohortId: string;
  name: string;
  deadline: string;
  weekdays: number[];
}): Promise<SubmissionType> {
  assertValidName(input.name);
  assertValidDeadline(input.deadline);

  const weekdays = normalizeWeekdays(input.weekdays);
  assertValidWeekdays(input.weekdays, weekdays);

  const db = await getDb();
  const tx = db.transaction("submissionTypes", "readwrite");

  await assertNameIsFree(tx.store, input.cohortId, input.name, null);

  const existing = await tx.store.index("by-cohort").getAll(input.cohortId);
  const maxOrder = existing.reduce(
    (largest, type) => Math.max(largest, type.order),
    0,
  );

  const type: SubmissionType = {
    id: newId(),
    cohortId: input.cohortId,
    name: input.name.trim(),
    deadline: input.deadline,
    weekdays,
    status: "active",
    order: maxOrder + 1,
    createdAt: Date.now(),
  };

  await tx.store.put(type);
  await tx.done;

  return type;
}

export async function updateSubmissionType(
  id: string,
  changes: { name: string; deadline: string; weekdays: number[] },
): Promise<SubmissionType> {
  assertValidName(changes.name);
  assertValidDeadline(changes.deadline);

  const weekdays = normalizeWeekdays(changes.weekdays);
  assertValidWeekdays(changes.weekdays, weekdays);

  const db = await getDb();
  const tx = db.transaction("submissionTypes", "readwrite");

  const current = await requireType(tx.store, id);
  await assertNameIsFree(tx.store, current.cohortId, changes.name, id);

  const updated: SubmissionType = {
    ...current,
    name: changes.name.trim(),
    deadline: changes.deadline,
    weekdays,
  };

  await tx.store.put(updated);
  await tx.done;

  return updated;
}

async function setStatus(
  id: string,
  status: SubmissionType["status"],
): Promise<SubmissionType> {
  const db = await getDb();
  const tx = db.transaction("submissionTypes", "readwrite");

  const current = await requireType(tx.store, id);
  const updated: SubmissionType = { ...current, status };

  await tx.store.put(updated);
  await tx.done;

  return updated;
}

/** 終了。過去の提出記録と集計には残る。 */
export function endSubmissionType(id: string): Promise<SubmissionType> {
  return setStatus(id, "ended");
}

export function restoreSubmissionType(id: string): Promise<SubmissionType> {
  return setStatus(id, "active");
}

/** 物理削除。名前は再利用できるようになる。 */
export async function deleteSubmissionType(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("submissionTypes", id);
}

/**
 * 有効な提出物の並びを1つ動かす。
 *
 * 終了したものは並べ替えの対象外なので、隣は「有効なものの中での隣」を指す。
 * 端で呼ばれた場合は何もしない（画面側でもボタンを無効にするが、
 * データ層だけを使う経路でも壊れないようにする）。
 */
export async function moveSubmissionType(
  id: string,
  direction: "up" | "down",
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("submissionTypes", "readwrite");

  const target = await requireType(tx.store, id);
  const siblings = (await tx.store.index("by-cohort").getAll(target.cohortId))
    .filter((type) => type.status === "active" && type.date === undefined)
    .sort((a, b) => a.order - b.order);

  const index = siblings.findIndex((type) => type.id === id);
  const neighbourIndex = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || neighbourIndex < 0 || neighbourIndex >= siblings.length) {
    await tx.done;
    return;
  }

  const neighbour = siblings[neighbourIndex];

  await Promise.all([
    tx.store.put({ ...target, order: neighbour.order }),
    tx.store.put({ ...neighbour, order: target.order }),
  ]);
  await tx.done;
}

/** 対象日にこの提出物が提出日かどうかを判定する。 */
export function isDueOn(type: SubmissionType, dateKey: string): boolean {
  if (type.date !== undefined) {
    return type.date === dateKey;
  }
  return type.weekdays.includes(weekdayOfDateKey(dateKey));
}
