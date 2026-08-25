# 未提出者一覧・集計 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先生が締切前後どちらでも使える「未提出者一覧」画面を作る。今日、まだ記録の無い在籍生徒を提出物ごとに一覧にし、締切を過ぎたグループは確定表示にする。加えて、直近2週間で未提出が多い生徒を見つける集計を同じ画面に載せる。

**Architecture:** 新しいストアは作らない。「記録が無い＝未提出」という既存の割り切りをそのまま使い、表示のたびに計算する純粋関数として実装する（`src/db/nonSubmitters.ts`）。DBスキーマ変更もマイグレーションも無い。画面は既存の `CohortGate` パターンを踏襲する。

**Tech Stack:** 追加の依存は無い。既存の `idb` / React / react-router のみ。

設計書: [`docs/superpowers/specs/2026-08-25-non-submitters-design.md`](../specs/2026-08-25-non-submitters-design.md)

## Global Constraints

- **ネットワークアクセスを一切書かない。**
- **UIの文言はすべて日本語。** エラー文は何が起きたかと次にどうするかを示す。謝罪表現は使わない。
- **配色トークンは5色のみ**: `gayoshi` / `sumi` / `ai` / `kogan` / `shu`。**Tailwind素のカラー（`text-white` 等）を使ってはいけない。**
- **朱は花丸と、完全に元へ戻せない操作（完全削除・復元）の確認ダイアログのみ。** このステップは表示のみで削除・復元を伴わないため、**朱を一切使わない**。
- 書体: 数値は `font-num`、見出しは `font-display`。**Klee One を本文に使わない。**
- スマホ幅375pxまで崩れない、キーボードフォーカスが見える、タップ領域は44px四方以上。
- TypeScriptは `strict: true`。`any` を使わない。`noUnusedLocals: true` なので未使用importでビルドが落ちる。
- **テストは非同期に変わる内容を1回だけ見て判定しない。** 現れる内容には `findBy*`、既存要素の属性には `waitFor` を使う。
- **`vi.useFakeTimers` は使わない。** fake-indexeddbのスケジューリングと`waitFor`の両方が壊れる。日付・時刻に依存するテストは、実際の今日から相対的にデータを組み立てる。
- 各タスクの最後に必ずコミットする。

## 現状の前提

- テスト305件が通っている。**終わったときも全部通っていること。**
- `npm run test:run`、`npm run build`（`tsc --noEmit && vite build`）
- `src/db/schema.ts` の型:
  ```ts
  export type Student = {
    id: string;
    cohortId: string;
    attendanceNumber: number;
    name: string;
    status: "active" | "transferredOut";
    createdAt: number;
  };

  export type SubmissionType = {
    id: string;
    cohortId: string;
    name: string;
    deadline: string; // "HH:mm"
    weekdays: number[]; // 0=日曜〜6=土曜、昇順・重複なし
    status: "active" | "ended";
    order: number;
    createdAt: number;
  };

  export type Submission = {
    id: string;
    cohortId: string;
    studentId: string;
    submissionTypeId: string;
    date: string; // "YYYY-MM-DD"
    submittedAt: number;
  };
  ```
- `src/db/students.ts` に `listStudents(cohortId: string): Promise<Student[]>` がある。在籍・転出を問わず全員を出席番号昇順で返す
- `src/db/submissionTypes.ts` に `listSubmissionTypes(cohortId: string): Promise<SubmissionType[]>` がある。`order` 昇順で返す
- `src/db/submissions.ts` に `listSubmissions(cohortId: string, date: string): Promise<Submission[]>` がある（対象日ちょうどの記録のみ）
- `src/lib/date.ts` に `toDateKey(date: Date): string`（"YYYY-MM-DD"をローカルで作る）と `formatDateHeading(date: Date): string`（例: "8月24日(月)"）がある
- `src/hooks/useAsync.ts` に `useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> & { reload: () => void }` がある。`AsyncState<T>` は `{status:"loading"} | {status:"ready", data:T} | {status:"error", message:string}`
- `src/components/CohortGate.tsx` に `CohortGate`（子を包んでcohortが無ければ`/setup`へ飛ばす）と `useActiveCohort(): Cohort`（`CohortGate`の中でのみ使える）がある
- `src/components/FullScreenMessage.tsx` は `{children, tone?: "normal"|"error", showBackLink?: boolean}` を受け、`tone="error"`のとき既定で `/roster` への戻り導線を出す
- `src/App.tsx` は `<Routes>` の中に `/roster`, `/scan`, `/print`, `/settings`, `/submissions` 等のルートを持つ
- `src/screens/Roster.tsx` の下部ナビは「提出チェック」「生徒を追加」の後、`<div className="flex gap-3">` で「QRを印刷」「提出物の設定」を横並びにしている

---

### Task 1: 日付・締切のヘルパー関数

`src/lib/date.ts` に3つの純粋関数を追加する。他のどのタスクもこれに依存する。

**Files:**
- Modify: `src/lib/date.ts`
- Test: `src/lib/date.test.ts`

**Interfaces:**
- Produces:
  - `isPastDeadline(date: string, deadline: string, now: Date): boolean`
  - `weekdayOfDateKey(dateKey: string): number`
  - `recentDateKeys(endDate: string, days: number): string[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/date.test.ts` の末尾に追記する:

```ts
describe("isPastDeadline", () => {
  it("過去の日付は締切時刻に関わらず過ぎている", () => {
    expect(
      isPastDeadline("2026-08-20", "23:59", new Date(2026, 7, 24, 0, 0)),
    ).toBe(true);
  });

  it("未来の日付は締切時刻に関わらず過ぎていない", () => {
    expect(
      isPastDeadline("2026-08-30", "00:00", new Date(2026, 7, 24, 23, 59)),
    ).toBe(false);
  });

  it("今日で締切時刻ちょうどなら過ぎている", () => {
    expect(
      isPastDeadline("2026-08-24", "08:15", new Date(2026, 7, 24, 8, 15)),
    ).toBe(true);
  });

  it("今日で締切1分前なら過ぎていない", () => {
    expect(
      isPastDeadline("2026-08-24", "08:15", new Date(2026, 7, 24, 8, 14)),
    ).toBe(false);
  });

  it("今日で締切1分後なら過ぎている", () => {
    expect(
      isPastDeadline("2026-08-24", "08:15", new Date(2026, 7, 24, 8, 16)),
    ).toBe(true);
  });
});

describe("weekdayOfDateKey", () => {
  it("月曜を1で返す", () => {
    // 2026-08-24 は月曜
    expect(weekdayOfDateKey("2026-08-24")).toBe(1);
  });

  it("日曜を0で返す", () => {
    expect(weekdayOfDateKey("2026-08-23")).toBe(0);
  });
});

describe("recentDateKeys", () => {
  it("endDateを含むdays日ぶんを古い順に返す", () => {
    expect(recentDateKeys("2026-08-25", 3)).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
    ]);
  });

  it("月をまたぐ", () => {
    expect(recentDateKeys("2026-09-01", 3)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });

  it("days=1ならendDateだけ返す", () => {
    expect(recentDateKeys("2026-08-25", 1)).toEqual(["2026-08-25"]);
  });
});
```

ファイル冒頭のimportを更新する:

```ts
import { formatDateHeading, isPastDeadline, recentDateKeys, toDateKey, weekdayOfDateKey } from "./date";
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:run -- src/lib/date.test.ts`
Expected: FAIL — `isPastDeadline is not defined` 等

- [ ] **Step 3: 実装する**

`src/lib/date.ts` の末尾に追記する:

```ts
/**
 * 対象日の締切を、現在時刻の時点で過ぎているか判定する。
 *
 * 過去の日付は常にtrue（どんな締切時刻でも既に過ぎている）。
 * 今日の日付は、現在時刻と締切時刻（"HH:mm"）を比較する。
 */
export function isPastDeadline(
  date: string,
  deadline: string,
  now: Date,
): boolean {
  const today = toDateKey(now);
  if (date < today) {
    return true;
  }
  if (date > today) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [hours, minutes] = deadline.split(":").map(Number);
  return nowMinutes >= hours * 60 + minutes;
}

/**
 * "YYYY-MM-DD" の曜日を返す。
 *
 * new Date(dateKey) は文字列をUTCとして解釈するため、タイムゾーンによっては
 * 曜日がずれる。年月日を分解してローカル時刻で構築することでこれを避ける。
 */
export function weekdayOfDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/** endDate を含む直近 days 日ぶんの日付キーを、古い順に返す。 */
export function recentDateKeys(endDate: string, days: number): string[] {
  const [year, month, day] = endDate.split("-").map(Number);
  const end = new Date(year, month - 1, day);

  return Array.from({ length: days }, (_, i) => {
    const current = new Date(end);
    current.setDate(current.getDate() - (days - 1 - i));
    return toDateKey(current);
  });
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm run test:run -- src/lib/date.test.ts`
Expected: PASS（既存分と合わせて18件）

- [ ] **Step 5: コミット**

```bash
git add src/lib/date.ts src/lib/date.test.ts
git commit -m "feat: 締切判定・曜日・直近日付のヘルパーを追加"
```

---

### Task 2: 今日の未提出者を計算する

**Files:**
- Create: `src/db/nonSubmitters.ts`
- Test: `src/db/nonSubmitters.test.ts`

**Interfaces:**
- Consumes:
  - `listStudents(cohortId: string): Promise<Student[]>`（`src/db/students.ts`）
  - `listSubmissionTypes(cohortId: string): Promise<SubmissionType[]>`（`src/db/submissionTypes.ts`）
  - `listSubmissions(cohortId: string, date: string): Promise<Submission[]>`（`src/db/submissions.ts`）
  - `isPastDeadline(date, deadline, now)`, `weekdayOfDateKey(dateKey)`（Task 1）
- Produces:
  - `type TodayNonSubmitterGroup = { type: SubmissionType; deadlinePassed: boolean; students: Student[] }`
  - `listTodayNonSubmitters(cohortId: string, date: string, now: Date): Promise<TodayNonSubmitterGroup[]>`

- [ ] **Step 1: 失敗するテストを書く**

`src/db/nonSubmitters.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType, endSubmissionType } from "./submissionTypes";
import { recordSubmission } from "./submissions";
import { listTodayNonSubmitters } from "./nonSubmitters";

useFreshDb();

// 2026-08-24 は月曜
const DATE = "2026-08-24";
const MONDAY = 1;
const SUNDAY = 0;

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

describe("listTodayNonSubmitters", () => {
  it("今日が提出日でない提出物は含まない", async () => {
    await addSubmissionType({
      cohortId,
      name: "週末だけの提出物",
      deadline: "08:15",
      weekdays: [SUNDAY],
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toEqual([]);
  });

  it("終了した提出物は含まない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    await endSubmissionType(type.id);

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toEqual([]);
  });

  it("記録の無い在籍生徒だけを出席番号順で返す", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const s3 = await addStudent({ cohortId, attendanceNumber: 3 });
    await addStudent({ cohortId, attendanceNumber: 1 });
    await recordSubmission({
      cohortId,
      studentId: s3.id,
      submissionTypeIds: [type.id],
      date: DATE,
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].students.map((s) => s.attendanceNumber)).toEqual([1]);
  });

  it("転出した生徒は含まない", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const out = await addStudent({ cohortId, attendanceNumber: 9 });
    await transferOutStudent(out.id);

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups[0].students).toEqual([]);
  });

  it("全員提出済みならstudentsが空配列", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    await recordSubmission({
      cohortId,
      studentId: student.id,
      submissionTypeIds: [type.id],
      date: DATE,
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups[0].students).toEqual([]);
  });

  it("締切前はdeadlinePassedがfalse", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 8, 0),
    );

    expect(groups[0].deadlinePassed).toBe(false);
  });

  it("締切後はdeadlinePassedがtrue", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 8, 30),
    );

    expect(groups[0].deadlinePassed).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:run -- src/db/nonSubmitters.test.ts`
Expected: FAIL — `Failed to resolve import "./nonSubmitters"`

- [ ] **Step 3: 実装する**

`src/db/nonSubmitters.ts`:

```ts
import { isPastDeadline, weekdayOfDateKey } from "../lib/date";
import type { Student, SubmissionType } from "./schema";
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
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm run test:run -- src/db/nonSubmitters.test.ts`
Expected: PASS（7件）

- [ ] **Step 5: コミット**

```bash
git add src/db/nonSubmitters.ts src/db/nonSubmitters.test.ts
git commit -m "feat: 今日の未提出者を計算する関数を追加"
```

---

### Task 3: 直近2週間の未提出回数を集計する

**Files:**
- Modify: `src/db/nonSubmitters.ts`（Task 2で作成したファイルに追記）
- Test: `src/db/nonSubmitters.test.ts`（追記）

**Interfaces:**
- Consumes:
  - `recentDateKeys(endDate, days)`, `weekdayOfDateKey(dateKey)`, `isPastDeadline(date, deadline, now)`, `toDateKey(date)`（Task 1・既存）
  - `listStudents`, `listSubmissionTypes`（既存）
  - `getDb(): Promise<IDBPDatabase<HomeworkDB>>`（`src/db/schema.ts`）— `by-cohort-date` インデックスへの範囲クエリに使う
- Produces:
  - `type NonSubmissionCount = { student: Student; count: number }`
  - `countRecentNonSubmissions(cohortId: string, endDate: string, now: Date, days: number): Promise<NonSubmissionCount[]>`

- [ ] **Step 1: 失敗するテストを書く**

`src/db/nonSubmitters.test.ts` の末尾に追記する。まずファイル冒頭のimportを更新する。既存の `import { listTodayNonSubmitters } from "./nonSubmitters";` を次に置き換え、新しい2行を追加する:

```ts
import { getDb } from "./schema";
import { recentDateKeys, toDateKey } from "../lib/date";
import { countRecentNonSubmissions, listTodayNonSubmitters } from "./nonSubmitters";
```

```ts
/** 提出物のcreatedAtを過去にずらす。集計期間より前に作られたことにするため。 */
async function backdateType(id: string, daysAgo: number): Promise<void> {
  const db = await getDb();
  const type = await db.get("submissionTypes", id);
  if (type === undefined) {
    throw new Error("提出物が見つかりません（テストの前提が壊れている）");
  }
  await db.put("submissionTypes", {
    ...type,
    createdAt: Date.now() - daysAgo * 24 * 60 * 60 * 1000,
  });
}

describe("countRecentNonSubmissions", () => {
  const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
  const today = toDateKey(new Date());

  it("生徒ごとに未提出回数を数える。0回の生徒は含まない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "毎日の提出物",
      deadline: "00:00", // 常に過ぎている扱いにして時刻依存のテストにしない
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);

    const dates = recentDateKeys(today, 3);
    const missed = await addStudent({ cohortId, attendanceNumber: 1 });
    const submitted = await addStudent({ cohortId, attendanceNumber: 2 });

    for (const date of dates) {
      await recordSubmission({
        cohortId,
        studentId: submitted.id,
        submissionTypeIds: [type.id],
        date,
      });
    }

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toHaveLength(1);
    expect(result[0].student.attendanceNumber).toBe(missed.attendanceNumber);
    expect(result[0].count).toBe(3);
  });

  it("多い順に並べる。同数なら出席番号昇順", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "毎日の提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);

    const dates = recentDateKeys(today, 3);
    const worst = await addStudent({ cohortId, attendanceNumber: 3 }); // 3回とも未提出
    const tieA = await addStudent({ cohortId, attendanceNumber: 5 }); // 1回だけ提出
    const tieB = await addStudent({ cohortId, attendanceNumber: 2 }); // 1回だけ提出

    await recordSubmission({
      cohortId,
      studentId: tieA.id,
      submissionTypeIds: [type.id],
      date: dates[0],
    });
    await recordSubmission({
      cohortId,
      studentId: tieB.id,
      submissionTypeIds: [type.id],
      date: dates[0],
    });

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result.map((r) => r.student.attendanceNumber)).toEqual([
      worst.attendanceNumber,
      tieB.attendanceNumber,
      tieA.attendanceNumber,
    ]);
  });

  it("終了した提出物は数えない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "終了した提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);
    await endSubmissionType(type.id);
    await addStudent({ cohortId, attendanceNumber: 1 });

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toEqual([]);
  });

  it("提出物の作成日より前の日付は数えない", async () => {
    // backdateしない。作成日は「今」のまま。
    await addSubmissionType({
      cohortId,
      name: "今日登録した提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    // 直近3日のうち、作成日である今日ぶんしか数えない
    expect(result[0].count).toBe(1);
  });

  it("転出した生徒は数えない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "毎日の提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);
    const out = await addStudent({ cohortId, attendanceNumber: 1 });
    await transferOutStudent(out.id);

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:run -- src/db/nonSubmitters.test.ts`
Expected: FAIL — `countRecentNonSubmissions is not defined`

- [ ] **Step 3: 実装する**

`src/db/nonSubmitters.ts` の冒頭のimportを次に置き換える:

```ts
import { isPastDeadline, recentDateKeys, toDateKey, weekdayOfDateKey } from "../lib/date";
import type { Student, SubmissionType } from "./schema";
import { getDb } from "./schema";
import { listStudents } from "./students";
import { listSubmissionTypes } from "./submissionTypes";
import { listSubmissions } from "./submissions";
```

ファイルの末尾に追記する:

```ts
export type NonSubmissionCount = {
  student: Student;
  count: number;
};

/**
 * 直近 days 日間で、生徒ごとに何回未提出があったかを数える。
 *
 * 対象は現在アクティブな提出物のみ（終了した提出物について声をかける
 * 意味は無い）。カウント0の生徒は結果に含めない。多い順、同数なら
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
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm run test:run -- src/db/nonSubmitters.test.ts`
Expected: PASS（12件）

- [ ] **Step 5: コミット**

```bash
git add src/db/nonSubmitters.ts src/db/nonSubmitters.test.ts
git commit -m "feat: 直近2週間の未提出回数を集計する関数を追加"
```

---

### Task 4: 未提出者・集計画面

**Files:**
- Create: `src/hooks/useTodayNonSubmitters.ts`
- Create: `src/hooks/useRecentNonSubmissionCounts.ts`
- Create: `src/screens/Unsubmitted.tsx`
- Create: `src/screens/Unsubmitted.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/screens/Roster.tsx`
- Modify: `src/screens/Roster.test.tsx`

**Interfaces:**
- Consumes:
  - `listTodayNonSubmitters`, `TodayNonSubmitterGroup`（Task 2）
  - `countRecentNonSubmissions`, `NonSubmissionCount`（Task 3）
  - `CohortGate`, `useActiveCohort()`（既存）
  - `FullScreenMessage`（既存）
  - `formatDateHeading(date: Date): string`, `toDateKey(date: Date): string`（既存）
- Produces:
  - `Unsubmitted`コンポーネント（`src/screens/Unsubmitted.tsx`）
  - ルート `/unsubmitted`

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/Roster.test.tsx` の「下部のボタン」describeブロックに追記する:

```ts
  it("未提出者・集計への導線がある", async () => {
    renderRoster();

    expect(
      await screen.findByRole("link", { name: "未提出者・集計を見る" }),
    ).toHaveAttribute("href", "/unsubmitted");
  });
```

`src/screens/Unsubmitted.test.tsx`:

```tsx
import { useFreshDb } from "../test/db";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { addStudent, transferOutStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { recordSubmission } from "../db/submissions";
import { toDateKey } from "../lib/date";

useFreshDb();

const today = new Date();
const todayKey = toDateKey(today);
const todayWeekday = today.getDay();
const otherWeekday = (todayWeekday + 1) % 7;

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("未提出者・集計画面", () => {
  it("今日提出日の提出物が無ければ案内を出す", async () => {
    await addSubmissionType({
      cohortId,
      name: "今日は提出日でない提出物",
      deadline: "08:15",
      weekdays: [otherWeekday],
    });

    renderAt("/unsubmitted");

    expect(
      await screen.findByText("今日は確認する提出物がありません"),
    ).toBeInTheDocument();
  });

  it("未提出の生徒を出席番号順に表示し、締切前は残り時間を出す", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 12 });
    await addStudent({ cohortId, attendanceNumber: 3 });

    renderAt("/unsubmitted");

    expect(
      await screen.findByText("計算ドリル・締切23:59"),
    ).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/^あと\d+分$/)).toBeInTheDocument();
  });

  it("提出済みなら全員提出しましたに置き換える", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    const student = await addStudent({ cohortId, attendanceNumber: 7 });
    await recordSubmission({
      cohortId,
      studentId: student.id,
      submissionTypeIds: [type.id],
      date: todayKey,
    });

    renderAt("/unsubmitted");

    expect(
      await screen.findByText("計算ドリルは全員提出しました"),
    ).toBeInTheDocument();
  });

  it("締切を過ぎたら確定と表示する", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "00:00",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    renderAt("/unsubmitted");

    expect(await screen.findByText("確定")).toBeInTheDocument();
  });

  it("転出した生徒は一覧に出さない", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    const out = await addStudent({ cohortId, attendanceNumber: 9 });
    await transferOutStudent(out.id);

    renderAt("/unsubmitted");

    await screen.findByText("計算ドリル・締切23:59");
    expect(screen.queryByText("9")).toBeNull();
  });

  it("直近の未提出が無ければ案内を出す", async () => {
    renderAt("/unsubmitted");

    expect(await screen.findByText("未提出はありません")).toBeInTheDocument();
  });

  it("今日の未提出は集計にも反映される", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "00:00",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 4 });

    renderAt("/unsubmitted");

    expect(await screen.findByText("4番")).toBeInTheDocument();
    expect(screen.getByText("1回")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:run -- src/screens/Unsubmitted.test.tsx src/screens/Roster.test.tsx`
Expected: FAIL — `Unsubmitted.test.tsx` は `Failed to resolve import "../App"` にはならない（`App.tsx`自体は存在する）が、`/unsubmitted` ルートが無いため `*` にマッチして `/scan` へリダイレクトされ、期待した文言が見つからずタイムアウトで失敗する。`Roster.test.tsx` の新規テストは「未提出者・集計を見る」というリンクが見つからず失敗する

- [ ] **Step 3: フックを作る**

`src/hooks/useTodayNonSubmitters.ts`:

```ts
import type { TodayNonSubmitterGroup } from "../db/nonSubmitters";
import { listTodayNonSubmitters } from "../db/nonSubmitters";
import { useAsync, type AsyncState } from "./useAsync";

export function useTodayNonSubmitters(
  cohortId: string,
  date: string,
  now: Date,
): AsyncState<TodayNonSubmitterGroup[]> & { reload: () => void } {
  return useAsync(
    () => listTodayNonSubmitters(cohortId, date, now),
    `today-non-submitters:${cohortId}:${date}`,
  );
}
```

`src/hooks/useRecentNonSubmissionCounts.ts`:

```ts
import type { NonSubmissionCount } from "../db/nonSubmitters";
import { countRecentNonSubmissions } from "../db/nonSubmitters";
import { useAsync, type AsyncState } from "./useAsync";

const RECENT_DAYS = 14;

export function useRecentNonSubmissionCounts(
  cohortId: string,
  endDate: string,
  now: Date,
): AsyncState<NonSubmissionCount[]> & { reload: () => void } {
  return useAsync(
    () => countRecentNonSubmissions(cohortId, endDate, now, RECENT_DAYS),
    `recent-non-submissions:${cohortId}:${endDate}`,
  );
}
```

これらにテストは書かない。`useAsync` の配線だけで、判断ロジックはTask 2・3で検証済みのため（`useStudents.ts`等の既存フックも同様にテスト無し）。

- [ ] **Step 4: 画面を作る**

`src/screens/Unsubmitted.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { useRecentNonSubmissionCounts } from "../hooks/useRecentNonSubmissionCounts";
import { useTodayNonSubmitters } from "../hooks/useTodayNonSubmitters";
import { formatDateHeading, toDateKey } from "../lib/date";

/** "HH:mm" の締切まであと何分か。負の値にはならない呼び出し方を前提とする。 */
function minutesUntil(deadline: string, now: Date): number {
  const [hours, minutes] = deadline.split(":").map(Number);
  const deadlineMinutes = hours * 60 + minutes;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return deadlineMinutes - nowMinutes;
}

function UnsubmittedBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の時刻で固定する。Scan画面と同じ理由:
  // 朝の数分で使い切る画面で、開きっぱなしを想定しない。
  const [now] = useState(() => new Date());
  const date = toDateKey(now);

  const groups = useTodayNonSubmitters(cohort.id, date, now);
  const counts = useRecentNonSubmissionCounts(cohort.id, date, now);

  if (groups.status === "loading" || counts.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (groups.status === "error") {
    return <FullScreenMessage tone="error">{groups.message}</FullScreenMessage>;
  }
  if (counts.status === "error") {
    return <FullScreenMessage tone="error">{counts.message}</FullScreenMessage>;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <h1 className="font-display text-ai text-2xl">
          {formatDateHeading(now)}
        </h1>
        <Link to="/roster" className="text-ai shrink-0 p-2 font-bold underline">
          名簿へ
        </Link>
      </header>

      <section className="flex flex-col gap-5">
        <h2 className="font-display text-ai text-xl">今日の未提出</h2>

        {groups.data.length === 0 ? (
          <p>今日は確認する提出物がありません</p>
        ) : (
          groups.data.map((group) => (
            <div key={group.type.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">
                  {group.type.name}・締切{group.type.deadline}
                </p>
                <span
                  className={
                    group.deadlinePassed
                      ? "bg-sumi rounded px-2 py-1 text-sm font-bold text-gayoshi"
                      : "border-ai text-ai rounded border px-2 py-1 text-sm font-bold"
                  }
                >
                  {group.deadlinePassed
                    ? "確定"
                    : `あと${minutesUntil(group.type.deadline, now)}分`}
                </span>
              </div>

              {group.students.length === 0 ? (
                <p className="text-sm">{group.type.name}は全員提出しました</p>
              ) : (
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                  {group.students.map((student) => (
                    <li
                      key={student.id}
                      className="border-ai text-sumi flex aspect-square min-h-16 items-center justify-center rounded border-2"
                    >
                      <span className="font-num text-[2rem] leading-none font-bold">
                        {student.attendanceNumber}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-ai text-xl">
          直近2週間で未提出が多い生徒
        </h2>

        {counts.data.length === 0 ? (
          <p>未提出はありません</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {counts.data.map(({ student, count }) => (
              <li
                key={student.id}
                className="border-kogan flex items-center justify-between border-b pb-2"
              >
                <span className="font-num font-bold">
                  {student.attendanceNumber}番
                  {student.name !== "" ? ` ${student.name}` : ""}
                </span>
                <span className="font-num font-bold">{count}回</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export function Unsubmitted() {
  return (
    <CohortGate>
      <UnsubmittedBody />
    </CohortGate>
  );
}
```

- [ ] **Step 5: ルートとナビを配線する**

`src/App.tsx` のimportに追加する:

```tsx
import { Unsubmitted } from "./screens/Unsubmitted";
```

`<Routes>` 内、`/submissions/:id/edit` のルートの後に追加する:

```tsx
      <Route path="/unsubmitted" element={<Unsubmitted />} />
```

`src/screens/Roster.tsx` の `<div className="flex gap-3">...</div>` ブロックの直後（`</nav>` の直前）に追加する:

```tsx
        <Link
          to="/unsubmitted"
          className="border-ai text-ai rounded border-2 px-4 py-3 text-center font-bold"
        >
          未提出者・集計を見る
        </Link>
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm run test:run`
Expected: PASS 全件（305 + 本タスクで追加した分）

- [ ] **Step 7: コミット**

```bash
git add src/hooks/useTodayNonSubmitters.ts src/hooks/useRecentNonSubmissionCounts.ts src/screens/Unsubmitted.tsx src/screens/Unsubmitted.test.tsx src/App.tsx src/screens/Roster.tsx src/screens/Roster.test.tsx
git commit -m "feat: 未提出者・集計画面を追加"
```

---

## 最終確認

- [ ] `npm run test:run` — 全件PASS
- [ ] `npm run build` — `tsc --noEmit && vite build` が通る
- [ ] 制約の機械的な検査:
  ```bash
  grep -rn "text-shu\|bg-shu\|border-shu" src/screens/Unsubmitted.tsx src/screens/Roster.tsx src/hooks/useTodayNonSubmitters.ts src/hooks/useRecentNonSubmissionCounts.ts src/db/nonSubmitters.ts
  # 何も出ないこと（このステップは朱を一切使わない）
  grep -rn "text-white\|bg-white\|text-black\|bg-black\|text-gray\|bg-gray\|text-red\|bg-red\|text-blue\|bg-blue" src/screens/Unsubmitted.tsx src/screens/Roster.tsx
  # 何も出ないこと
  grep -rn ": any\|<any>\|as any" src/db/nonSubmitters.ts src/screens/Unsubmitted.tsx src/hooks/useTodayNonSubmitters.ts src/hooks/useRecentNonSubmissionCounts.ts src/lib/date.ts
  # 何も出ないこと
  ```
- [ ] `docs/手元での確認手順.md` にステップ4の確認項目を追記する（画面が実機で確認されるまで、この一覧も含めて未確認のため）
