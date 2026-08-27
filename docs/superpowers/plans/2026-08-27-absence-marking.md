# 欠席者枠（未提出者一覧の拡張） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 未提出者一覧画面（`/unsubmitted`）で、提出物ごとに生徒を「欠席」としてマークできるようにする。欠席は未提出と区別され、直近2週間の未提出集計から除外される。

**Architecture:** 新しいIndexedDBストアは作らない。既存の `submissions` ストア（`by-unique`: `[date, studentId, submissionTypeId]`）に任意フィールド `status?: "submitted" | "absent"` を追加し、「この組み合わせについての状態は1つ」という既存の一意制約をそのまま流用する。DBバージョンは上げない。画面側は既存の `ConfirmDialog`（`tone="normal"`）を再利用し、新しいUIパターンは増やさない。

**Tech Stack:** React 19, TypeScript strict, idb (IndexedDB), Vitest + Testing Library, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-absence-marking-design.md`

## Global Constraints

- ネットワークアクセスを書かない。`fetch`、CDN、外部URLは禁止
- 配色は5トークンのみ（`gayoshi` / `sumi` / `ai` / `kogan` / `shu`）。Tailwind素のカラーを使わない
- 朱（`shu`）は花丸と完全に元へ戻せない操作の確認ダイアログだけ。欠席マーク・取り消しは元に戻せる操作なので `ConfirmDialog` の `tone="normal"`（既定値）を使う。`tone="danger"` は使わない
- TypeScript `strict`。`any` を使わない。`noUnusedLocals: true` — バインドしたが参照しない変数はビルドを落とす
- タップ領域は44px四方以上。既存グリッドは `min-h-16`（64px）でこれを満たしている
- `put()` は失敗すると同期的に例外を投げる。欠席→提出の上書きは、既存レコードの `id` を再利用して `put()` する。新しい `id` で別レコードを追加しようとすると、`by-unique` の一意制約に違反して同期的に `ConstraintError` が投げられる
- `vi.useFakeTimers` は使わない。日付に依存するテストは実際の今日から相対的に組み立てる
- 非同期に変わる内容を1回だけ見て判定しない。`findBy*` は要素の出現を待つだけで中身の更新は待たない

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/db/schema.ts` | `Submission` 型に `status?: "submitted" \| "absent"` を追加（Task 1） |
| `src/db/submissions.ts` | `markAbsent` / `unmarkAbsent` を追加（Task 1）。`recordSubmission` を欠席上書き対応にする（Task 2） |
| `src/db/submissions.test.ts` | 上記のテストを追加 |
| `src/db/nonSubmitters.ts` | `listTodayNonSubmitters` の戻り値を状態つきに変更（Task 3） |
| `src/db/nonSubmitters.test.ts` | 上記のテストを追加・既存アサーションを更新 |
| `src/screens/Unsubmitted.tsx` | グリッドセルをタップ可能にし、`ConfirmDialog` で欠席マーク／取り消しを行う（Task 4） |
| `src/screens/Unsubmitted.test.tsx` | 上記のテストを追加 |

---

### Task 1: `markAbsent` / `unmarkAbsent` を追加する

**Files:**
- Modify: `src/db/schema.ts:44-53`
- Modify: `src/db/submissions.ts`（末尾に追加）
- Test: `src/db/submissions.test.ts`

**Interfaces:**
- Produces: `Submission.status?: "submitted" | "absent"`、`MarkAbsentResult = { kind: "marked" } | { kind: "alreadyRecorded" }`、`markAbsent(input: { cohortId: string; studentId: string; submissionTypeId: string; date: string }): Promise<MarkAbsentResult>`、`unmarkAbsent(input: { studentId: string; submissionTypeId: string; date: string }): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`src/db/submissions.test.ts` の1行目、既存のimportを次のように変更する:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType } from "./submissionTypes";
import {
  countByType,
  listSubmissions,
  markAbsent,
  recordSubmission,
  unmarkAbsent,
} from "./submissions";
```

ファイル末尾（`describe("countByType", ...)` ブロックの後）に追加する:

```ts

describe("markAbsent", () => {
  it("記録の無い生徒を欠席として記録する", async () => {
    const result = await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });

    expect(result.kind).toBe("marked");
    const submissions = await listSubmissions(cohortId, DATE);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe("absent");
  });

  it("既に記録がある生徒には書き込まずalreadyRecordedを返す", async () => {
    await record();

    const result = await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });

    expect(result.kind).toBe("alreadyRecorded");
    const submissions = await listSubmissions(cohortId, DATE);
    expect(submissions).toHaveLength(1);
    // この時点の recordSubmission はまだ status を書かない(Task 2で変更する)。
    // 既存レコードが有る/無いだけを見て弾くことを確認できればよい。
    expect(submissions[0].status).toBeUndefined();
  });
});

describe("unmarkAbsent", () => {
  it("欠席の記録を削除する", async () => {
    await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });

    await unmarkAbsent({ studentId, submissionTypeId: drillId, date: DATE });

    expect(await listSubmissions(cohortId, DATE)).toHaveLength(0);
  });

  it("記録が無ければ何もしない", async () => {
    await unmarkAbsent({ studentId, submissionTypeId: drillId, date: DATE });

    expect(await listSubmissions(cohortId, DATE)).toHaveLength(0);
  });

  it("提出済みの記録は消さない", async () => {
    await record();

    await unmarkAbsent({ studentId, submissionTypeId: drillId, date: DATE });

    expect(await listSubmissions(cohortId, DATE)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/db/submissions.test.ts`
Expected: FAIL — `markAbsent`/`unmarkAbsent` が存在しないためimportエラーになる

- [ ] **Step 3: `Submission` 型に `status` を追加する**

`src/db/schema.ts:44-53` を置き換える:

```ts
export type Submission = {
  id: string;
  cohortId: string;
  studentId: string;
  submissionTypeId: string;
  /** "YYYY-MM-DD" ローカル日付。Dateだとタイムゾーンや時分で同日判定が壊れる。 */
  date: string;
  /** epoch ms。最初に提出（または欠席マーク）した時刻。二度目のスキャンで上書きしない。 */
  submittedAt: number;
  /** 無ければ "submitted" 扱い（既存レコードとの後方互換）。DB_VERSIONは上げない。 */
  status?: "submitted" | "absent";
};
```

- [ ] **Step 4: `markAbsent` / `unmarkAbsent` を実装する**

`src/db/submissions.ts` の末尾に追加する:

```ts

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
```

既存の `recordSubmission` はまだ `status` を書かないため、この時点で作られる「提出済み」レコードは `status: undefined` のままになる。Task 2で `recordSubmission` が `"submitted"` を明示的に書くよう変更したら、上のテストのアサーションも合わせて直す（Task 2のStep 1）。

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `npx vitest run src/db/submissions.test.ts`
Expected: PASS（全件）

- [ ] **Step 6: コミット**

```bash
git add src/db/schema.ts src/db/submissions.ts src/db/submissions.test.ts
git commit -m "$(cat <<'EOF'
feat: 提出記録に欠席状態を追加する markAbsent/unmarkAbsent を実装

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `recordSubmission` が欠席レコードを提出に上書きできるようにする

**Files:**
- Modify: `src/db/submissions.ts:42-91`（`recordSubmission`）
- Test: `src/db/submissions.test.ts`

**Interfaces:**
- Consumes: `markAbsent`（Task 1）
- Produces: `recordSubmission` の挙動変更のみ。新規exportは無し

- [ ] **Step 1: Task 1で先送りしたアサーションを直す**

`src/db/submissions.test.ts` の `describe("markAbsent", ...)` 内、「既に記録がある生徒には書き込まずalreadyRecordedを返す」テストの
```ts
expect(submissions[0].status).toBeUndefined();
```
を、この後のStep 4で `recordSubmission` が `status: "submitted"` を明示的に書くようになるのに合わせて次に直す:
```ts
expect(submissions[0].status).toBe("submitted");
```
（この時点ではまだ `recordSubmission` を変更していないので、一旦PASSしていたこのテストがStep 1の変更直後は失敗する状態になる。Step 3のテスト実行で他の新規テストと一緒に失敗することを確認すればよい）

- [ ] **Step 2: 失敗するテストを書く**

`describe("recordSubmission", ...)` ブロック内、「提出物が空なら記録しない」テストの後に追加する:

```ts

  it("欠席の記録を提出に上書きする", async () => {
    await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });

    const result = await record();

    expect(result.kind).toBe("recorded");
    const submissions = await listSubmissions(cohortId, DATE);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe("submitted");
  });

  it("欠席から提出への上書きでレコードを複製しない", async () => {
    await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });
    const absentId = (await listSubmissions(cohortId, DATE))[0].id;

    await record();

    const submissions = await listSubmissions(cohortId, DATE);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].id).toBe(absentId);
  });
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `npx vitest run src/db/submissions.test.ts`
Expected: 3件FAIL — 現状の `recordSubmission` は既存レコード（欠席含む）があると無条件でスキップし、`status` も書かないため、Step 1で直した「既に記録がある生徒には書き込まずalreadyRecordedを返す」（`status` が `undefined` のまま）と、Step 2で追加した2件（`result.kind` が `"recorded"` ではなく `"already"` になる）が失敗する

- [ ] **Step 4: `recordSubmission` を書き換える**

`src/db/submissions.ts:42-91` を次で置き換える:

```ts
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
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `npx vitest run src/db/submissions.test.ts`
Expected: PASS（全件）

- [ ] **Step 6: コミット**

```bash
git add src/db/submissions.ts src/db/submissions.test.ts
git commit -m "$(cat <<'EOF'
feat: recordSubmissionが欠席の記録を提出に上書きできるようにする

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `listTodayNonSubmitters` が欠席状態を返すようにする

**Files:**
- Modify: `src/db/nonSubmitters.ts`
- Test: `src/db/nonSubmitters.test.ts`

**Interfaces:**
- Consumes: `markAbsent`（Task 1）
- Produces: `TodayNonSubmitterGroup.students: { student: Student; status: "unmarked" | "absent" }[]`（既存の `Student[]` から変更）

- [ ] **Step 1: 失敗するテストを書く**

`src/db/nonSubmitters.test.ts` の import を変更する（`recordSubmission` の行を次に置き換え）:

```ts
import { markAbsent, recordSubmission } from "./submissions";
```

既存の「記録の無い在籍生徒だけを出席番号順で返す」テスト（29行目付近）を次で置き換える:

```ts
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
    expect(groups[0].students.map((s) => s.student.attendanceNumber)).toEqual([
      1,
    ]);
    expect(groups[0].students[0].status).toBe("unmarked");
  });
```

`describe("listTodayNonSubmitters", ...)` ブロックの末尾（「締切後はdeadlinePassedがtrue」テストの後）に追加する:

```ts

  it("欠席とマークした生徒はabsent状態で一覧に残る", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const student = await addStudent({ cohortId, attendanceNumber: 5 });
    await markAbsent({
      cohortId,
      studentId: student.id,
      submissionTypeId: type.id,
      date: DATE,
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups[0].students).toHaveLength(1);
    expect(groups[0].students[0].status).toBe("absent");
  });

  it("欠席と未マークが混在しても出席番号順を保つ", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const s1 = await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 2 });
    await markAbsent({
      cohortId,
      studentId: s1.id,
      submissionTypeId: type.id,
      date: DATE,
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups[0].students.map((s) => s.student.attendanceNumber)).toEqual([
      1, 2,
    ]);
    expect(groups[0].students.map((s) => s.status)).toEqual([
      "absent",
      "unmarked",
    ]);
  });
```

`describe("countRecentNonSubmissions", ...)` ブロックの末尾に追加する:

```ts

  it("欠席とマークされた日は未提出カウントに含めない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "毎日の提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);

    const dates = recentDateKeys(today, 3);
    const student = await addStudent({ cohortId, attendanceNumber: 1 });

    for (const date of dates) {
      await markAbsent({
        cohortId,
        studentId: student.id,
        submissionTypeId: type.id,
        date,
      });
    }

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toEqual([]);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/db/nonSubmitters.test.ts`
Expected: 「記録の無い在籍生徒だけを出席番号順で返す」「欠席とマークした生徒はabsent状態で一覧に残る」「欠席と未マークが混在しても出席番号順を保つ」がFAIL（`students` がまだ `Student[]` のままで `.student` プロパティが無い）。**「欠席とマークされた日は未提出カウントに含めない」はこの時点でもPASSする** — `countRecentNonSubmissions` は「そのキーの行が存在するか」だけを見ており、`markAbsent` が書く行もこの条件を満たすため、実装変更なしで正しい。これはTDDの赤ではなく、既存ロジックが新しい書き込み経路にもそのまま効くことを確認する回帰テスト

- [ ] **Step 3: `listTodayNonSubmitters` を書き換える**

`src/db/nonSubmitters.ts` の `TodayNonSubmitterGroup` 型と `listTodayNonSubmitters` 関数（13–57行目）を次で置き換える:

```ts
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

  const weekday = weekdayOfDateKey(date);
  const dueTypes = types.filter(
    (type) => type.status === "active" && type.weekdays.includes(weekday),
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
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run src/db/nonSubmitters.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/db/nonSubmitters.ts src/db/nonSubmitters.test.ts
git commit -m "$(cat <<'EOF'
feat: listTodayNonSubmittersが欠席状態を区別して返すようにする

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 未提出者一覧画面にタップ操作と欠席の見た目を追加する

**Files:**
- Modify: `src/screens/Unsubmitted.tsx`
- Test: `src/screens/Unsubmitted.test.tsx`

**Interfaces:**
- Consumes: `markAbsent`, `unmarkAbsent`（`../db/submissions`、Task 1/2）、`TodayNonSubmitterGroup`（`../db/nonSubmitters`、Task 3で変更済みの形）、`ConfirmDialog`（`../components/ConfirmDialog`、既存）

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/Unsubmitted.test.tsx` の6-10行目、既存のimportを次のように変更する:

```ts
import { useFreshDb } from "../test/db";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { addStudent, transferOutStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { markAbsent, recordSubmission } from "../db/submissions";
import { toDateKey } from "../lib/date";
```

ファイル末尾（`describe("未提出者・集計画面", ...)` ブロックの最後のテストの後）に追加する:

```ts

  it("未提出のセルをタップして欠席にできる", async () => {
    const user = userEvent.setup();
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 5 });

    renderAt("/unsubmitted");

    await user.click(await screen.findByRole("button", { name: "5番" }));
    await user.click(
      await screen.findByRole("button", { name: "欠席にする" }),
    );

    const cell = await screen.findByRole("button", { name: "5番（欠席）" });
    expect(cell).toHaveAttribute("data-status", "absent");
  });

  it("欠席のセルをタップして取り消せる", async () => {
    const user = userEvent.setup();
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    const student = await addStudent({ cohortId, attendanceNumber: 5 });
    await markAbsent({
      cohortId,
      studentId: student.id,
      submissionTypeId: type.id,
      date: todayKey,
    });

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "5番（欠席）" }),
    );
    await user.click(await screen.findByRole("button", { name: "取り消す" }));

    const cell = await screen.findByRole("button", { name: "5番" });
    expect(cell).toHaveAttribute("data-status", "unmarked");
  });

  it("やめるを押すと何も変わらない", async () => {
    const user = userEvent.setup();
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 5 });

    renderAt("/unsubmitted");

    await user.click(await screen.findByRole("button", { name: "5番" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    const cell = await screen.findByRole("button", { name: "5番" });
    expect(cell).toHaveAttribute("data-status", "unmarked");
  });

  it("欠席にすると直近2週間の集計から除外される", async () => {
    const user = userEvent.setup();
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

    await user.click(await screen.findByRole("button", { name: "4番" }));
    await user.click(
      await screen.findByRole("button", { name: "欠席にする" }),
    );

    await screen.findByText("未提出はありません");
    expect(screen.queryByText("4番")).toBeNull();
  });
```

**注意:** `aria-label` の文字列は日本語の全角括弧 `（欠席）` を使う（他のコンポーネント、`StudentCell.tsx` の `（転出）` と同じ規約）。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/screens/Unsubmitted.test.tsx`
Expected: FAIL — グリッドセルがまだ `<button>` ではないため `findByRole("button", { name: "5番" })` がタイムアウトする

- [ ] **Step 3: `Unsubmitted.tsx` を書き換える**

`src/screens/Unsubmitted.tsx` 全体を次で置き換える:

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { markAbsent, unmarkAbsent } from "../db/submissions";
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

type Pending = {
  studentId: string;
  submissionTypeId: string;
  attendanceNumber: number;
  action: "markAbsent" | "unmarkAbsent";
};

function UnsubmittedBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の時刻で固定する。Scan画面と同じ理由:
  // 朝の数分で使い切る画面で、開きっぱなしを想定しない。
  const [now] = useState(() => new Date());
  const date = toDateKey(now);

  const groups = useTodayNonSubmitters(cohort.id, date, now);
  const counts = useRecentNonSubmissionCounts(cohort.id, date, now);

  const [pending, setPending] = useState<Pending | null>(null);

  if (groups.status === "loading" || counts.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (groups.status === "error") {
    return <FullScreenMessage tone="error">{groups.message}</FullScreenMessage>;
  }
  if (counts.status === "error") {
    return <FullScreenMessage tone="error">{counts.message}</FullScreenMessage>;
  }

  function reload(): void {
    groups.reload();
    counts.reload();
  }

  function confirmPending(): void {
    if (pending === null) {
      return;
    }
    const action =
      pending.action === "markAbsent"
        ? markAbsent({
            cohortId: cohort.id,
            studentId: pending.studentId,
            submissionTypeId: pending.submissionTypeId,
            date,
          })
        : unmarkAbsent({
            studentId: pending.studentId,
            submissionTypeId: pending.submissionTypeId,
            date,
          });
    setPending(null);
    void action.then(reload);
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
                  {group.students.map(({ student, status }) => {
                    const absent = status === "absent";
                    const label = absent
                      ? `${student.attendanceNumber}番（欠席）`
                      : `${student.attendanceNumber}番`;

                    return (
                      <li key={student.id}>
                        <button
                          type="button"
                          data-testid="unsubmitted-cell"
                          data-status={status}
                          aria-label={label}
                          onClick={() =>
                            setPending({
                              studentId: student.id,
                              submissionTypeId: group.type.id,
                              attendanceNumber: student.attendanceNumber,
                              action: absent ? "unmarkAbsent" : "markAbsent",
                            })
                          }
                          className={[
                            "flex aspect-square min-h-16 w-full items-center justify-center rounded",
                            absent
                              ? "border-kogan text-kogan hatch border-2 border-dashed"
                              : "border-ai text-sumi border-2",
                          ].join(" ")}
                        >
                          <span className="font-num text-[2rem] leading-none font-bold">
                            {student.attendanceNumber}
                          </span>
                        </button>
                      </li>
                    );
                  })}
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

      {pending !== null && (
        <ConfirmDialog
          title={
            pending.action === "markAbsent"
              ? `${pending.attendanceNumber}番を欠席にしますか`
              : `${pending.attendanceNumber}番の欠席を取り消しますか`
          }
          message={
            pending.action === "markAbsent"
              ? "この提出物についてだけ、未提出から除きます"
              : "未提出に戻します"
          }
          confirmLabel={
            pending.action === "markAbsent" ? "欠席にする" : "取り消す"
          }
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
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

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run src/screens/Unsubmitted.test.tsx`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/screens/Unsubmitted.tsx src/screens/Unsubmitted.test.tsx
git commit -m "$(cat <<'EOF'
feat: 未提出者一覧で生徒を欠席にマーク・取り消しできるようにする

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 全体確認と制約チェック

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テストを実行する**

Run: `npm run test:run`
Expected: 全件PASS

- [ ] **Step 2: ビルドを確認する**

Run: `npm run build`
Expected: `tsc --noEmit` と `vite build` がエラー無く完了する

- [ ] **Step 3: 制約の機械チェック**

Run:
```bash
grep -n "text-shu\|bg-shu\|border-shu" src/screens/Unsubmitted.tsx || echo "朱の使用なし(OK)"
grep -nE "text-(white|black|red|blue|green|gray|slate|zinc|yellow)-[0-9]|bg-(white|black|red|blue|green|gray|slate|zinc|yellow)-[0-9]" src/screens/Unsubmitted.tsx src/db/submissions.ts src/db/nonSubmitters.ts src/db/schema.ts || echo "Tailwind素のカラーなし(OK)"
grep -n ": any\b\|<any>\|as any" src/screens/Unsubmitted.tsx src/db/submissions.ts src/db/nonSubmitters.ts src/db/schema.ts || echo "anyの使用なし(OK)"
```
Expected: 3つとも「なし(OK)」が出る（`ConfirmDialog` 内部の `tone="danger"` 用の朱は今回のマーク操作では使わないため、`Unsubmitted.tsx` 自体には朱の文字列が出てこない）

- [ ] **Step 4: わざと壊してテストが落ちることを確認する（破壊試験）**

`src/db/submissions.ts` の `unmarkAbsent` 内、`existing.status === "absent"` の条件を一時的に `true` に変える。

Run: `npx vitest run src/db/submissions.test.ts`
Expected: 「提出済みの記録は消さない」がFAIL する(実提出のレコードまで消えてしまうため)

元に戻す（`existing.status === "absent"` に戻す）。

Run: `npx vitest run src/db/submissions.test.ts`
Expected: 全件PASSに戻る

- [ ] **Step 5: コミット（変更が無ければスキップ）**

Step 4の変更は最終的に元に戻しているため、通常はここでのコミットは無い。`git status` で差分が無いことを確認する。

```bash
git status
```
Expected: `nothing to commit, working tree clean`

---

## Self-Review

- **spec coverage:** データ層（3.1–3.4）→ Task 1–3、画面（4.1–4.3）→ Task 4、テスト方針（5）→ 各Taskに破壊試験を配置しTask 5でも一つ追加、対象外（6）→ 一括マーク・過去日付・提出済みからの変更はどのタスクでも実装していない（意図的に対象外のまま）
- **placeholder scan:** 「TBD」「後で」等の記述なし。すべてのコードブロックは実際に貼り付け可能な完全なコード
- **type consistency:** `TodayNonSubmitterGroup.students` の要素型 `{ student: Student; status: "unmarked" | "absent" }` はTask 3で定義し、Task 4で分割代入 `({ student, status })` として一貫して使用している。`MarkAbsentResult` はTask 1で定義し、他のタスクでは戻り値として直接は使わない（画面側は `void action.then(reload)` で結果を見ずに再読み込みする設計のため）
