# 日付を選んで提出チェック・採点する Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教員のスキャン画面・児童のスキャン画面・採点画面に日付送りを足し、翌日提出の先取りチェックと過去日の遅れた提出の記録・確認をできるようにする。

**Architecture:** データ層は無変更。提出のタイミング（先に提出/通常/遅れて提出）は `submission.date`（提出日）と `submission.submittedAt`（受け取った時刻）の比較から導出する純粋関数として持ち、新しいフィールドもDBバージョンも増やさない。3画面共通の日付送りUIを1つのコンポーネントに切り出す。

**Tech Stack:** React 19 / TypeScript strict / Vite / idb (IndexedDB) / Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-09-03-date-selection-design.md`

## Global Constraints

- ネットワークアクセスを書かない。`fetch`・CDN・外部URLは禁止
- 配色は5トークンのみ: `gayoshi` / `sumi` / `ai` / `kogan` / `shu`。Tailwind素のカラー（`text-white`等）は使わない。藍（`bg-ai`）の上に載せる文字は `text-gayoshi`
- 朱（`shu`）は花丸と `ConfirmDialog` の `tone="danger"` だけ。本計画のどのタスクも朱を新規に使わない
- 数値は `font-num`、見出しは `font-display`。`Klee One`（`font-display`）を本文に使わない
- UIの文言は日本語。謝罪表現を使わない
- TypeScript `strict`。`any` を使わない。`noUnusedLocals: true` なので未使用importでビルドが落ちる
- 375px幅で崩れない。タップ領域は44px四方以上（`min-h-11` / `size-11`）
- `vi.useFakeTimers` を使わない。日付に依存するテストは実際の今日から相対的に組み立てる
- `findBy*` は要素の出現だけを待つ。既存要素の中身の更新を見るときは `waitFor` で囲む
- 再描画で差し替わるDOM参照を使い回さない。毎回引き直す

---

## Task 1: 提出のタイミングを求める純粋関数（`src/lib/date.ts`）

**Files:**
- Modify: `src/lib/date.ts`
- Test: `src/lib/date.test.ts`

**Interfaces:**
- Consumes: 既存の `dateFromKey`, `toDateKey`（同ファイル内）
- Produces:
  - `addDays(dateKey: string, days: number): string`
  - `type SubmissionTiming = "early" | "onTime" | "late"`
  - `submissionTiming(dateKey: string, submittedAt: number): SubmissionTiming`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/date.test.ts` の末尾（最後の `describe("weekDates", ...)` ブロックの後）に追記する:

```ts
describe("addDays", () => {
  it("指定日数だけ先に進める", () => {
    expect(addDays("2026-08-24", 1)).toBe("2026-08-25");
  });

  it("負の日数で過去に戻せる", () => {
    expect(addDays("2026-08-24", -1)).toBe("2026-08-23");
  });

  it("月をまたぐ", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("0日なら同じ日を返す", () => {
    expect(addDays("2026-08-24", 0)).toBe("2026-08-24");
  });
});

describe("submissionTiming", () => {
  it("提出日と同じ日に受け取ったらonTime", () => {
    const submittedAt = new Date(2026, 7, 24, 8, 0).getTime();
    expect(submissionTiming("2026-08-24", submittedAt)).toBe("onTime");
  });

  it("提出日より後に受け取ったらlate", () => {
    const submittedAt = new Date(2026, 7, 25, 8, 0).getTime();
    expect(submissionTiming("2026-08-24", submittedAt)).toBe("late");
  });

  it("提出日より前に受け取ったらearly", () => {
    const submittedAt = new Date(2026, 7, 23, 8, 0).getTime();
    expect(submissionTiming("2026-08-24", submittedAt)).toBe("early");
  });

  it("締切時刻は見ない。同じ日なら何時でもonTime", () => {
    const submittedAt = new Date(2026, 7, 24, 23, 59).getTime();
    expect(submissionTiming("2026-08-24", submittedAt)).toBe("onTime");
  });
});
```

ファイル冒頭のimportに `addDays` と `submissionTiming` を加える:

```ts
import {
  addDays,
  dateFromKey,
  formatDateHeading,
  isPastDeadline,
  recentDateKeys,
  startOfWeek,
  submissionTiming,
  toDateKey,
  weekDates,
  weekdayOfDateKey,
} from "./date";
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/lib/date.test.ts`
Expected: FAIL — `addDays`/`submissionTiming` が存在しない旨のエラー

- [ ] **Step 3: 実装する**

`src/lib/date.ts` の末尾（`weekDates` の後）に追記する:

```ts
/** dateKey から days 日後（負なら前）の日付キーを返す。 */
export function addDays(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export type SubmissionTiming = "early" | "onTime" | "late";

/**
 * 提出物の対象日と、実際に受け取った時刻(submittedAt)から、
 * 提出のタイミングを求める。
 *
 * 受け取った日は submittedAt をローカルで日付に切ったもの。締切時刻は見ない。
 * "YYYY-MM-DD" は辞書順の比較が日付の前後と一致する。
 */
export function submissionTiming(
  dateKey: string,
  submittedAt: number,
): SubmissionTiming {
  const received = toDateKey(new Date(submittedAt));
  if (received < dateKey) {
    return "early";
  }
  if (received > dateKey) {
    return "late";
  }
  return "onTime";
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/date.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/lib/date.ts src/lib/date.test.ts
git commit -m "$(cat <<'EOF'
feat: 提出のタイミング(先に提出/遅れて提出)を導出する関数を追加

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 日付送り共通コンポーネント（`src/components/DateStepper.tsx`）

**Files:**
- Create: `src/components/DateStepper.tsx`
- Test: `src/components/DateStepper.test.tsx`

**Interfaces:**
- Consumes: `addDays` from `src/lib/date.ts`（Task 1）
- Produces:
  ```ts
  DateStepper(props: {
    date: string;
    today: string;
    onChange: (next: string) => void;
    labels: { prev: string; next: string; backToToday: string };
    min?: string;
    max?: string;
  }): JSX.Element
  ```

**表示ルール（3つのボタン、条件は独立）:**
- 前日ボタン: `min` の範囲内 かつ 前日が `today` と一致しない ときだけ出す
- 翌日ボタン: `max` の範囲内 かつ 翌日が `today` と一致しない ときだけ出す
- 今日へボタン: `date !== today` のときだけ出す

前日（または翌日）がちょうど `today` と一致するときにその方向のボタンを出さないのは、「今日へ」ボタンと同じ行き先の重複ボタンを避けるため。この行き先はコンポーネント内部で `date`・`today`・`min`・`max` だけから計算し、呼び出し側でmin/maxを調整する必要はない。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/DateStepper.test.tsx` を新規作成する:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateStepper } from "./DateStepper";

const labels = { prev: "← 前日", next: "翌日 →", backToToday: "今日へ" };

describe("DateStepper", () => {
  it("前後のボタンを出す", () => {
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
      />,
    );

    expect(screen.getByRole("button", { name: "← 前日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "翌日 →" })).toBeInTheDocument();
  });

  it("前日を押すと1日前をonChangeで渡す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-20"
        onChange={onChange}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-23");
  });

  it("翌日を押すと1日後をonChangeで渡す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-20"
        onChange={onChange}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("button", { name: "翌日 →" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-25");
  });

  it("今日にいるときは「今日へ」を出さない", () => {
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
      />,
    );

    expect(screen.queryByRole("button", { name: "今日へ" })).toBeNull();
  });

  it("今日以外にいるときは「今日へ」を出す。押すと今日に戻る", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateStepper
        date="2026-08-27"
        today="2026-08-24"
        onChange={onChange}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("button", { name: "今日へ" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-24");
  });

  it("minを下回る前日ボタンは出さない", () => {
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
        min="2026-08-24"
      />,
    );

    expect(screen.queryByRole("button", { name: "← 前日" })).toBeNull();
  });

  it("maxを上回る翌日ボタンは出さない", () => {
    render(
      <DateStepper
        date="2026-08-25"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
        max="2026-08-25"
      />,
    );

    expect(screen.queryByRole("button", { name: "翌日 →" })).toBeNull();
  });

  it("前日がちょうど今日なら、前日ボタンではなく今日へボタンだけになる", () => {
    render(
      <DateStepper
        date="2026-08-25"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
      />,
    );

    expect(screen.queryByRole("button", { name: "← 前日" })).toBeNull();
    expect(screen.getByRole("button", { name: "今日へ" })).toBeInTheDocument();
  });

  it("翌日がちょうど今日なら、翌日ボタンではなく今日へボタンだけになる", () => {
    render(
      <DateStepper
        date="2026-08-23"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
      />,
    );

    expect(screen.queryByRole("button", { name: "翌日 →" })).toBeNull();
    expect(screen.getByRole("button", { name: "今日へ" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/components/DateStepper.test.tsx`
Expected: FAIL — `./DateStepper` が存在しない

- [ ] **Step 3: 実装する**

`src/components/DateStepper.tsx` を新規作成する:

```tsx
import { addDays } from "../lib/date";

export function DateStepper({
  date,
  today,
  onChange,
  labels,
  min,
  max,
}: {
  date: string;
  today: string;
  onChange: (next: string) => void;
  labels: { prev: string; next: string; backToToday: string };
  min?: string;
  max?: string;
}) {
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  // 前後どちらかの1日先が「今日」とちょうど一致するときは、その方向の
  // ボタンを出さない。出すと「今日へ」ボタンと行き先が重なり、
  // 違う見た目で同じ移動をする2つのボタンが並んでしまう。
  const showPrev =
    (min === undefined || prevDate >= min) && prevDate !== today;
  const showNext =
    (max === undefined || nextDate <= max) && nextDate !== today;
  const showBackToToday = date !== today;

  return (
    <div className="flex gap-2">
      {showPrev && (
        <button
          type="button"
          onClick={() => onChange(prevDate)}
          className="border-ai text-ai min-h-11 rounded border-2 px-4 font-bold"
        >
          {labels.prev}
        </button>
      )}
      {showBackToToday && (
        <button
          type="button"
          onClick={() => onChange(today)}
          className="bg-ai min-h-11 rounded px-4 font-bold text-gayoshi"
        >
          {labels.backToToday}
        </button>
      )}
      {showNext && (
        <button
          type="button"
          onClick={() => onChange(nextDate)}
          className="border-ai text-ai min-h-11 rounded border-2 px-4 font-bold"
        >
          {labels.next}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components/DateStepper.test.tsx`
Expected: PASS（全9件）

- [ ] **Step 5: コミット**

```bash
git add src/components/DateStepper.tsx src/components/DateStepper.test.tsx
git commit -m "$(cat <<'EOF'
feat: 日付送りの共通コンポーネントDateStepperを追加

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 採点対象を受け取った日で絞る（`src/db/grading.ts`）

**Files:**
- Modify: `src/db/grading.ts`
- Modify: `src/db/grading.test.ts`

**Interfaces:**
- Consumes: `toDateKey` from `../lib/date`（既存）
- Produces:
  ```ts
  listGradingItems(cohortId: string, receivedDate: string): Promise<{
    ungraded: GradingItem[];
    resubmitPending: GradingItem[];
    otherDaysUngradedCount: number;
    oldestUngradedDate: string | null;
  }>
  ```
  `GradingItem` の形は変更しない（`{ submission, student, type }`）。

**この絞り込みだけで「未提出者一覧」と「直近の未提出回数」への波及が無い理由:** `src/db/nonSubmitters.ts` の両関数は、提出記録の有無を `submission.date`（提出日そのもの）で判定しており、`submittedAt`（受け取った時刻）を一切見ない。教員が過去の提出日を選んで遅れた提出を記録すると、その記録の `date` はその過去の提出日になるため、`nonSubmitters.ts` 側は何も変更しなくても「その日はもう未提出ではない」と正しく扱う。したがって本タスクは `grading.ts` だけを変更し、`nonSubmitters.ts` には触れない。

- [ ] **Step 1: 失敗するテストを書く**

`src/db/grading.test.ts` を以下の内容で置き換える:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { getDb } from "./schema";
import { createCohort } from "./cohorts";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType } from "./submissionTypes";
import { markAbsent, recordSubmission } from "./submissions";
import { clearGrade, gradeSubmission, listGradingItems } from "./grading";
import { newId } from "../lib/id";
import { toDateKey } from "../lib/date";

useFreshDb();

const TODAY = toDateKey(new Date());

let cohortId = "";
let typeId = "";
let studentId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;

  const type = await addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline: "08:15",
    weekdays: [1, 2, 3, 4, 5],
  });
  typeId = type.id;

  const student = await addStudent({ cohortId, attendanceNumber: 5 });
  studentId = student.id;
});

function submit(date: string) {
  return recordSubmission({
    cohortId,
    studentId,
    submissionTypeIds: [typeId],
    date,
  });
}

/**
 * date を提出日、submittedAt を受け取った時刻とする未採点の記録を直接
 * 書き込む。recordSubmission は submittedAt を常に Date.now() にするため、
 * 受け取った日をずらすテストにはこちらを使う。
 */
async function putUngraded(date: string, submittedAt: number): Promise<void> {
  const db = await getDb();
  await db.put("submissions", {
    id: newId(),
    cohortId,
    studentId,
    submissionTypeId: typeId,
    date,
    submittedAt,
    status: "submitted",
  });
}

describe("listGradingItems", () => {
  it("提出済みで未採点の記録を返す", async () => {
    await submit("2026-08-24");

    const { ungraded, resubmitPending } = await listGradingItems(
      cohortId,
      TODAY,
    );

    expect(ungraded).toHaveLength(1);
    expect(ungraded[0].student.attendanceNumber).toBe(5);
    expect(ungraded[0].type.name).toBe("計算ドリル");
    expect(resubmitPending).toHaveLength(0);
  });

  it("提出日を問わず、受け取った日(今日)の記録を返す", async () => {
    await submit("2026-01-01");
    await submit("2026-12-31");

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded).toHaveLength(2);
  });

  it("受け取った日で絞る。他の日に受け取った記録は含めない", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await putUngraded(TODAY, Date.now());
    await putUngraded(toDateKey(yesterday), yesterday.getTime());

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded).toHaveLength(1);
  });

  it("欠席の記録は含めない", async () => {
    await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: typeId,
      date: "2026-08-24",
    });

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded).toHaveLength(0);
  });

  it("転出した生徒の記録は含めない", async () => {
    await submit("2026-08-24");
    await transferOutStudent(studentId);

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded).toHaveLength(0);
  });

  it("gradeがpassedの記録はungradedにもresubmitPendingにも含めない", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);
    await gradeSubmission(before.ungraded[0].submission.id, "passed");

    const { ungraded, resubmitPending } = await listGradingItems(
      cohortId,
      TODAY,
    );

    expect(ungraded).toHaveLength(0);
    expect(resubmitPending).toHaveLength(0);
  });

  it("gradeがresubmitの記録はresubmitPendingに入る", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);
    await gradeSubmission(before.ungraded[0].submission.id, "resubmit");

    const { ungraded, resubmitPending } = await listGradingItems(
      cohortId,
      TODAY,
    );

    expect(ungraded).toHaveLength(0);
    expect(resubmitPending).toHaveLength(1);
    expect(resubmitPending[0].submission.grade).toBe("resubmit");
  });

  it("再提出待ちは受け取った日で絞らない", async () => {
    await putUngraded("2026-01-01", Date.now());
    const before = await listGradingItems(cohortId, TODAY);
    await gradeSubmission(before.ungraded[0].submission.id, "resubmit");

    // 別の日を指定しても、再提出待ちには同じ記録が出続ける
    const otherDay = toDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const { resubmitPending } = await listGradingItems(cohortId, otherDay);

    expect(resubmitPending).toHaveLength(1);
  });

  it("日付→出席番号の順で並ぶ", async () => {
    const other = await addStudent({ cohortId, attendanceNumber: 2 });
    await recordSubmission({
      cohortId,
      studentId: other.id,
      submissionTypeIds: [typeId],
      date: "2026-08-24",
    });
    await submit("2026-08-23");

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded.map((item) => item.submission.date)).toEqual([
      "2026-08-23",
      "2026-08-24",
    ]);
  });

  it("他の日に未採点があれば件数と一番古い受け取り日を返す", async () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await putUngraded(toDateKey(oneDayAgo), oneDayAgo.getTime());
    await putUngraded(toDateKey(twoDaysAgo), twoDaysAgo.getTime());

    const { otherDaysUngradedCount, oldestUngradedDate } =
      await listGradingItems(cohortId, TODAY);

    expect(otherDaysUngradedCount).toBe(2);
    expect(oldestUngradedDate).toBe(toDateKey(twoDaysAgo));
  });

  it("他の日に未採点が無ければ件数は0、一番古い日はnull", async () => {
    await submit("2026-08-24"); // 今日受け取った分

    const { otherDaysUngradedCount, oldestUngradedDate } =
      await listGradingItems(cohortId, TODAY);

    expect(otherDaysUngradedCount).toBe(0);
    expect(oldestUngradedDate).toBeNull();
  });
});

describe("gradeSubmission", () => {
  it("採点結果を保存する", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);

    await gradeSubmission(before.ungraded[0].submission.id, "passed");

    const after = await listGradingItems(cohortId, TODAY);
    expect(after.ungraded).toHaveLength(0);
  });

  it("採点結果を変更できる", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);
    const id = before.ungraded[0].submission.id;

    await gradeSubmission(id, "resubmit");
    await gradeSubmission(id, "passed");

    const { resubmitPending } = await listGradingItems(cohortId, TODAY);
    expect(resubmitPending).toHaveLength(0);
  });
});

describe("clearGrade", () => {
  it("未採点に戻す", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);
    const id = before.ungraded[0].submission.id;
    await gradeSubmission(id, "resubmit");

    await clearGrade(id);

    const { ungraded, resubmitPending } = await listGradingItems(
      cohortId,
      TODAY,
    );
    expect(ungraded).toHaveLength(1);
    expect(resubmitPending).toHaveLength(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/db/grading.test.ts`
Expected: FAIL — `listGradingItems` の引数が合わない（TypeScriptの型エラー、または実行時に絞り込みが効かず件数が合わない）

- [ ] **Step 3: 実装する**

`src/db/grading.ts` を以下の内容で置き換える:

```ts
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
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/db/grading.test.ts`
Expected: PASS（全13件）

- [ ] **Step 5: わざと壊して確認する**

`otherReceivedDates.sort()` の行を一時的に削除する（ソートしないままにする）。`他の日に未採点があれば件数と一番古い受け取り日を返す` テストが `oldestUngradedDate` の期待値と食い違って落ちることを確認してから、元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/db/grading.ts src/db/grading.test.ts
git commit -m "$(cat <<'EOF'
feat: listGradingItemsを受け取った日で絞れるようにする

未採点(ungraded)は指定した受け取り日だけに絞り、他の日に残っている
未採点の件数と一番古い受け取り日をあわせて返す。再提出待ちは
これまで通り絞らない。提出日ではなく受け取った日で絞るのは、採点が
「今日手元にあるドリルを見る」作業だから。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 採点画面に日付送りを足す（`src/screens/Grading.tsx`, `src/hooks/useGradingItems.ts`）

**Files:**
- Modify: `src/hooks/useGradingItems.ts`
- Modify: `src/screens/Grading.tsx`
- Modify: `src/screens/Grading.test.tsx`

**Interfaces:**
- Consumes: `submissionTiming`, `type SubmissionTiming`（Task 1）、`DateStepper`（Task 2）、`listGradingItems`（Task 3）
- Produces: `useGradingItems(cohortId: string, receivedDate: string)`（既存の呼び出し元は無い。`Grading.tsx` からのみ使う）

**既存テストへの影響:** `Grading.test.tsx` の既存テストは全て `recordSubmission` 経由で記録しており、`submittedAt` は常にテスト実行時刻（＝実行日の「今日」）になる。採点画面の既定日は「今日」なので、既存テストは受け取った日フィルタの影響を受けず、コード変更なしで通り続ける。

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/Grading.test.tsx` の冒頭のimportを以下に置き換える（`getDb` と `formatDateHeading` を追加）:

```ts
import { useFreshDb } from "../test/db";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import { addStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { addDateSubmission } from "../db/dateSubmissions";
import { recordSubmission } from "../db/submissions";
import { getDb } from "../db/schema";
import * as gradingModule from "../db/grading";
import { formatDateHeading, toDateKey } from "../lib/date";
```

ファイル末尾（最後の `});` の直前、`describe("採点画面", ...)` ブロックの内側の末尾）に以下のテストを追加する:

```ts
  it("既定で今日の日付を表示する", async () => {
    renderAsTeacher("/grading");

    expect(
      await screen.findByText(formatDateHeading(new Date())),
    ).toBeInTheDocument();
  });

  it("日付を送ると、その日に受け取った未採点だけに絞られる", async () => {
    const user = userEvent.setup();
    const otherType = await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    const other = await addStudent({ cohortId, attendanceNumber: 9 });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const db = await getDb();
    await db.put("submissions", {
      id: "yesterday-submission",
      cohortId,
      studentId: other.id,
      submissionTypeId: otherType.id,
      date: toDateKey(yesterday),
      submittedAt: yesterday.getTime(),
      status: "submitted",
    });

    renderAsTeacher("/grading");

    await screen.findByText("計算ドリル");
    expect(screen.queryByText("日記")).toBeNull();

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    await screen.findByText("日記");
    expect(screen.queryByText("計算ドリル")).toBeNull();
  });

  it("再提出待ちは日付を送っても表示され続ける", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を再提出にする",
      }),
    );
    await screen.findByRole("button", {
      name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
    });

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    expect(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
      }),
    ).toBeInTheDocument();
  });

  it("ほかの日に未採点があれば案内を出し、押すとその日へ移る", async () => {
    const user = userEvent.setup();
    const otherType = await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    const other = await addStudent({ cohortId, attendanceNumber: 9 });
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const db = await getDb();
    await db.put("submissions", {
      id: "two-days-ago-submission",
      cohortId,
      studentId: other.id,
      submissionTypeId: otherType.id,
      date: toDateKey(twoDaysAgo),
      submittedAt: twoDaysAgo.getTime(),
      status: "submitted",
    });

    renderAsTeacher("/grading");

    const link = await screen.findByRole("button", {
      name: "ほかの日に未採点 1件 → 一番古い日へ",
    });
    await user.click(link);

    expect(await screen.findByText("日記")).toBeInTheDocument();
    expect(
      await screen.findByText(formatDateHeading(twoDaysAgo)),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/screens/Grading.test.tsx`
Expected: FAIL — DateStepperのボタンや「ほかの日に未採点」の案内が存在しない

- [ ] **Step 3: 実装する**

`src/hooks/useGradingItems.ts` を以下の内容で置き換える:

```ts
import type { GradingItem } from "../db/grading";
import { listGradingItems } from "../db/grading";
import { useAsync, type AsyncState } from "./useAsync";

export function useGradingItems(
  cohortId: string,
  receivedDate: string,
): AsyncState<{
  ungraded: GradingItem[];
  resubmitPending: GradingItem[];
  otherDaysUngradedCount: number;
  oldestUngradedDate: string | null;
}> & { reload: () => void } {
  return useAsync(
    () => listGradingItems(cohortId, receivedDate),
    `grading-items:${cohortId}:${receivedDate}`,
  );
}
```

`src/screens/Grading.tsx` を以下の内容で置き換える:

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { DateStepper } from "../components/DateStepper";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { clearGrade, gradeSubmission, type GradingItem } from "../db/grading";
import { useGradingItems } from "../hooks/useGradingItems";
import {
  dateFromKey,
  formatDateHeading,
  submissionTiming,
  toDateKey,
} from "../lib/date";

type TypeGroup = { typeId: string; typeName: string; items: GradingItem[] };

const DATE_LABELS = { prev: "← 前日", next: "翌日 →", backToToday: "今日へ" };

/**
 * 提出物ごとにまとめる。日付指定の提出物はorderが常に0のため、同日締切の
 * 複数項目が並ぶと表示順→日付のタイブレークが同点になり、出席番号だけで
 * 順位が決まって同じ提出物のitemが配列上で連続しないことがある。そのため
 * 配列の隣接ではなくtype.idをキーにしたMapでグルーピングする。itemsは
 * 既にtype.order順に並んでいるため、Mapの挿入順をそのままグループの
 * 並び順として使える。
 */
function groupByType(items: GradingItem[]): TypeGroup[] {
  const groups = new Map<string, TypeGroup>();
  for (const item of items) {
    const existing = groups.get(item.type.id);
    if (existing !== undefined) {
      existing.items.push(item);
    } else {
      groups.set(item.type.id, {
        typeId: item.type.id,
        typeName: item.type.name,
        items: [item],
      });
    }
  }
  return [...groups.values()];
}

function GradingRow({
  item,
  onGrade,
  onClear,
}: {
  item: GradingItem;
  onGrade: (id: string, grade: "passed" | "resubmit") => void;
  onClear?: (id: string) => void;
}) {
  const { submission, student } = item;
  const dateLabel = formatDateHeading(dateFromKey(submission.date));
  const nameLabel = `${student.attendanceNumber}番${student.name}`;
  const timing = submissionTiming(submission.date, submission.submittedAt);
  const timingLabel =
    timing === "late" ? "・遅れて提出" : timing === "early" ? "・先に提出" : "";

  return (
    <li className="border-kogan flex items-center justify-between gap-2 border-b py-2">
      <span className="font-num">
        {dateLabel} {nameLabel}
        {timingLabel}
      </span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          aria-label={`${dateLabel}の${student.attendanceNumber}番（${item.type.name}）を合格にする`}
          onClick={() => onGrade(submission.id, "passed")}
          className="bg-ai min-h-11 rounded px-3 font-bold text-gayoshi"
        >
          合格
        </button>
        {onClear === undefined ? (
          <button
            type="button"
            aria-label={`${dateLabel}の${student.attendanceNumber}番（${item.type.name}）を再提出にする`}
            onClick={() => onGrade(submission.id, "resubmit")}
            className="border-ai text-ai min-h-11 rounded border-2 px-3 font-bold"
          >
            再提出
          </button>
        ) : (
          <button
            type="button"
            aria-label={`${dateLabel}の${student.attendanceNumber}番（${item.type.name}）を未採点に戻す`}
            onClick={() => onClear(submission.id)}
            className="text-ai min-h-11 px-3 font-bold underline"
          >
            未採点に戻す
          </button>
        )}
      </div>
    </li>
  );
}

function GradingBody() {
  const cohort = useActiveCohort();
  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState(today);
  const items = useGradingItems(cohort.id, date);
  const [error, setError] = useState<string | null>(null);

  if (items.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (items.status === "error") {
    return <FullScreenMessage tone="error">{items.message}</FullScreenMessage>;
  }

  function changeDate(next: string): void {
    setError(null);
    setDate(next);
  }

  function grade(id: string, value: "passed" | "resubmit"): void {
    setError(null);
    void gradeSubmission(id, value)
      .then(() => items.reload())
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
      });
  }

  function clear(id: string): void {
    setError(null);
    void clearGrade(id)
      .then(() => items.reload())
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
      });
  }

  const ungradedGroups = groupByType(items.data.ungraded);
  const resubmitGroups = groupByType(items.data.resubmitPending);
  const oldestUngradedDate = items.data.oldestUngradedDate;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="font-display text-ai text-2xl">採点</h1>
          <p className="mt-1 text-sm font-bold">
            {formatDateHeading(dateFromKey(date))}
          </p>
        </div>
        <Link to="/roster" className="text-ai shrink-0 p-2 font-bold underline">
          名簿へ
        </Link>
      </header>

      <DateStepper
        date={date}
        today={today}
        onChange={changeDate}
        labels={DATE_LABELS}
      />

      {error !== null && (
        <p role="alert" className="text-sm font-bold">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-5">
        <h2 className="font-display text-ai text-xl">未採点</h2>

        {items.data.otherDaysUngradedCount > 0 && oldestUngradedDate !== null && (
          <button
            type="button"
            onClick={() => changeDate(oldestUngradedDate)}
            className="text-ai self-start font-bold underline"
          >
            ほかの日に未採点 {items.data.otherDaysUngradedCount}件 →
            一番古い日へ
          </button>
        )}

        {ungradedGroups.length === 0 ? (
          <p>未採点の提出物はありません</p>
        ) : (
          ungradedGroups.map((group) => (
            <div key={group.typeId} className="flex flex-col gap-1">
              <p className="font-bold">{group.typeName}</p>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <GradingRow
                    key={item.submission.id}
                    item={item}
                    onGrade={grade}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="font-display text-ai text-xl">再提出待ち</h2>

        {resubmitGroups.length === 0 ? (
          <p>再提出待ちの生徒はいません</p>
        ) : (
          resubmitGroups.map((group) => (
            <div key={group.typeId} className="flex flex-col gap-1">
              <p className="font-bold">{group.typeName}</p>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <GradingRow
                    key={item.submission.id}
                    item={item}
                    onGrade={grade}
                    onClear={clear}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

export function Grading() {
  return (
    <CohortGate>
      <GradingBody />
    </CohortGate>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/screens/Grading.test.tsx`
Expected: PASS（既存11件 + 新規4件）

- [ ] **Step 5: コミット**

```bash
git add src/hooks/useGradingItems.ts src/screens/Grading.tsx src/screens/Grading.test.tsx
git commit -m "$(cat <<'EOF'
feat: 採点画面に日付送りを足す

既定は今日。未採点はその日に受け取った分だけに絞り、他の日に
残っている未採点の件数から一番古い日へ1タップで移れるようにする。
再提出待ちは日付を送っても絞らない。行には遅れて提出/先に提出を
添える。ヘッダーは反転させない(採点はどの書き込みも日付付きの行の
ボタンを押す操作で、記録先が黙って決まる危険が無いため)。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 教員のスキャン画面に日付送りを足す（`src/components/ScanResult.tsx`, `src/screens/Scan.tsx`）

**Files:**
- Modify: `src/components/ScanResult.tsx`
- Modify: `src/screens/Scan.tsx`
- Modify: `src/screens/Scan.test.tsx`

**Interfaces:**
- Consumes: `DateStepper`（Task 2）
- Produces: `ScanResult({ result, dateLabel? })`（`KidsScan.tsx` からも呼ばれるが、`dateLabel` 省略時は今まで通りの見た目で変更なし）

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/Scan.test.tsx` の中の既存テストを1つ書き換える。`describe("提出物の選択", ...)` 内の次のテストの本文を置き換える:

```ts
  it("この日が提出日のものが無ければその旨を出す", async () => {
    await addType("日記", [OTHER_WEEKDAY]);
    renderScan();

    expect(
      await screen.findByText("この日が提出日の宿題はありません"),
    ).toBeInTheDocument();
  });
```

（テスト名と期待文言を「今日が」→「この日が」に変更。前後の他のテストはそのまま。）

ファイル末尾（最後の `describe("進捗", ...)` ブロックの後）に新しい `describe` を追加する:

```ts
describe("日付を送る", () => {
  it("前日へ送ると見出しが変わる", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");
    renderScan();

    await screen.findByText(formatDateHeading(TODAY));
    await user.click(screen.getByRole("button", { name: "← 前日" }));

    expect(
      await screen.findByText(formatDateHeading(YESTERDAY)),
    ).toBeInTheDocument();
  });

  it("前日へ送ると、その日に記録される", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル", [YESTERDAY.getDay()]);
    await addStudent({ cohortId, attendanceNumber: 12 });
    renderScan();

    await screen.findByText(formatDateHeading(TODAY));
    await user.click(screen.getByRole("button", { name: "← 前日" }));

    await user.click(await screen.findByRole("button", { name: "12番" }));
    await screen.findByText("提出しました");

    expect(await listSubmissions(cohortId, YESTERDAY_KEY)).toHaveLength(1);
    expect(await listSubmissions(cohortId, TODAY_KEY)).toHaveLength(0);
  });

  it("日付を送ると選択と直前の結果が消える", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル", [TODAY_WEEKDAY, YESTERDAY.getDay()]);
    await addStudent({ cohortId, attendanceNumber: 12 });
    renderScan();

    await user.click(await screen.findByRole("button", { name: "12番" }));
    await screen.findByText("提出しました");

    const toggle = await screen.findByRole("button", { name: /計算ドリル/ });
    await user.click(toggle);
    await waitFor(() =>
      expect(toggle).toHaveAttribute("aria-pressed", "false"),
    );

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /計算ドリル/ }),
      ).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.queryByTestId("scan-result")).toBeEmptyDOMElement();
  });

  it("今日以外を見ているときはヘッダーが反転する", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル", [TODAY_WEEKDAY, YESTERDAY.getDay()]);
    renderScan();

    const heading = await screen.findByText(formatDateHeading(TODAY));
    expect(heading).toHaveClass("text-ai");

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    const yesterdayHeading = await screen.findByText(
      formatDateHeading(YESTERDAY),
    );
    expect(yesterdayHeading).toHaveClass("text-gayoshi");
  });

  it("今日へで戻ると元の見た目に戻る", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル", [TODAY_WEEKDAY, YESTERDAY.getDay()]);
    renderScan();

    await screen.findByText(formatDateHeading(TODAY));
    await user.click(screen.getByRole("button", { name: "← 前日" }));
    await screen.findByText(formatDateHeading(YESTERDAY));

    await user.click(screen.getByRole("button", { name: "今日へ" }));

    const heading = await screen.findByText(formatDateHeading(TODAY));
    expect(heading).toHaveClass("text-ai");
  });

  it("今日以外へ記録すると、結果に対象日が添えられる", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル", [TODAY_WEEKDAY, YESTERDAY.getDay()]);
    await addStudent({ cohortId, attendanceNumber: 12 });
    renderScan();

    await user.click(screen.getByRole("button", { name: "← 前日" }));
    await user.click(await screen.findByRole("button", { name: "12番" }));

    const result = await screen.findByTestId("scan-result");
    expect(
      within(result).getByText(`${formatDateHeading(YESTERDAY)}分`),
    ).toBeInTheDocument();
  });

  it("今日を見ているときは対象日を添えない", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");
    await addStudent({ cohortId, attendanceNumber: 12 });
    renderScan();

    await user.click(await screen.findByRole("button", { name: "12番" }));
    await screen.findByText("提出しました");

    const result = screen.getByTestId("scan-result");
    expect(within(result).queryByText(/分$/)).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/screens/Scan.test.tsx`
Expected: FAIL — 「この日が提出日の宿題はありません」の文言が無い／`DateStepper`のボタンが無い／`dateLabel`が反映されない

- [ ] **Step 3: 実装する**

`src/components/ScanResult.tsx` を以下の内容で置き換える:

```tsx
import type { RecordResult } from "../db/submissions";
import { Hanamaru } from "./Hanamaru";

/** 直前のスキャン結果。何も読んでいなければ高さだけ確保する。 */
export function ScanResult({
  result,
  dateLabel,
}: {
  result: RecordResult | null;
  dateLabel?: string;
}) {
  if (result === null) {
    return <div data-testid="scan-result" className="min-h-28" />;
  }

  if (result.kind === "notFound") {
    return (
      <div
        data-testid="scan-result"
        role="status"
        className="flex min-h-28 items-center justify-center text-center font-bold"
      >
        このクラスの生徒ではありません
      </div>
    );
  }

  const number = `${result.student.attendanceNumber}番`;

  const message =
    result.kind === "recorded"
      ? "提出しました"
      : result.kind === "already"
        ? "提出済み"
        : "転出しています";

  return (
    <div
      data-testid="scan-result"
      role="status"
      className="flex min-h-28 flex-col items-center justify-center gap-1"
    >
      {result.kind === "recorded" && <Hanamaru />}
      {dateLabel !== undefined && (
        <span className="font-bold">{dateLabel}分</span>
      )}
      <span className="font-num text-3xl font-bold">{number}</span>
      <span className="font-bold">{message}</span>
    </div>
  );
}
```

`src/screens/Scan.tsx` を以下の内容で置き換える:

```tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { CameraView } from "../components/CameraView";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { DateStepper } from "../components/DateStepper";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { NumberPad } from "../components/NumberPad";
import { ScanResult } from "../components/ScanResult";
import { SubmissionToggleBar } from "../components/SubmissionToggleBar";
import { recordSubmission, type RecordResult } from "../db/submissions";
import { isDueOn } from "../db/submissionTypes";
import { useStudents } from "../hooks/useStudents";
import { useSubmissions } from "../hooks/useSubmissions";
import { useQrCamera } from "../hooks/useQrCamera";
import { useSubmissionTypes } from "../hooks/useSubmissionTypes";
import { dateFromKey, formatDateHeading, toDateKey } from "../lib/date";
import { parseQrPayload } from "../lib/qr";

const DATE_LABELS = { prev: "← 前日", next: "翌日 →", backToToday: "今日へ" };

function ScanBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の日付を今日として固定する。日付をまたいで開きっぱなしに
  // することは想定しない（朝の数分で使い切る画面のため）。日付送りで見ている
  // date はこれとは別に動く。
  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState(today);

  const students = useStudents(cohort.id);
  const types = useSubmissionTypes(cohort.id);
  const submissions = useSubmissions(cohort.id, date);

  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [result, setResult] = useState<RecordResult | null>(null);
  const [mode, setMode] = useState<"camera" | "number">("camera");

  // handleScan は selected を参照するが、それが決まるのは早期returnの後。
  // フックは早期returnより前に置く必要があるため、refで後から差し込む。
  const scanHandlerRef = useRef<(payload: string) => void>(() => {});
  const camera = useQrCamera({
    enabled: mode === "camera",
    onScan: (payload) => scanHandlerRef.current(payload),
  });

  // カメラが使えないと分かったら番号モードへ落とす。
  // 黙って何も映らないと、先生は端末の故障と考える。
  useEffect(() => {
    if (camera.state === "unavailable" || camera.state === "denied") {
      setMode("number");
    }
  }, [camera.state]);

  // 提出記録の再読み込みでは全画面の読み込み表示に戻さない。
  // 記録するたびに画面が差し替わると、出したばかりの花丸と結果が
  // 一瞬で消えてしまい、先生が読めたかどうか分からなくなる。
  if (students.status === "loading" || types.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (students.status === "error") {
    return <FullScreenMessage tone="error">{students.message}</FullScreenMessage>;
  }
  if (types.status === "error") {
    return <FullScreenMessage tone="error">{types.message}</FullScreenMessage>;
  }
  if (submissions.status === "error") {
    return (
      <FullScreenMessage tone="error">{submissions.message}</FullScreenMessage>
    );
  }

  // 再読み込み中は前回の一覧が無いので空として扱う。進捗の人数が
  // 一瞬0に見えるだけで、記録そのものには影響しない。
  const recorded =
    submissions.status === "ready" ? submissions.data : [];

  const activeTypes = types.data.filter((type) => type.status === "active");
  const todayTypes = activeTypes.filter((type) => isDueOn(type, date));

  // 初期状態は全部ON。毎朝すべてを確認するのが通常で、
  // 先生が毎回選び直す手間を省く。
  const selected = selectedIds ?? todayTypes.map((type) => type.id);

  const activeStudents = students.data.filter(
    (student) => student.status === "active",
  );

  const doneIds = activeStudents
    .filter((student) =>
      selected.every((typeId) =>
        recorded.some(
          (submission) =>
            submission.studentId === student.id &&
            submission.submissionTypeId === typeId,
        ),
      ),
    )
    .map((student) => student.id);

  const isToday = date === today;

  // 日付を送ったら選択と直前の結果を捨てる。持ち越すと、その日に
  // 提出日が来ていない項目が選択されたまま記録されてしまう。
  function changeDate(next: string): void {
    setDate(next);
    setSelectedIds(null);
    setResult(null);
  }

  function toggle(id: string): void {
    setSelectedIds(
      selected.includes(id)
        ? selected.filter((current) => current !== id)
        : [...selected, id],
    );
  }

  function pick(studentId: string): void {
    void recordSubmission({
      cohortId: cohort.id,
      studentId,
      submissionTypeIds: selected,
      date,
    }).then((next) => {
      setResult(next);
      submissions.reload();
    });
  }

  function handleScan(payload: string): void {
    if (selected.length === 0) {
      return;
    }

    const studentId = parseQrPayload(payload);
    if (studentId === null) {
      // このアプリのQRでなければ黙って無視する。教室で商品バーコードが
      // カメラに入っても先生の手を止めない。
      return;
    }
    pick(studentId);
  }

  scanHandlerRef.current = handleScan;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <header
        className={
          isToday
            ? "border-kogan flex items-center justify-between gap-3 border-b pb-3"
            : "bg-ai flex items-center justify-between gap-3 rounded p-3"
        }
      >
        <h1
          className={
            isToday
              ? "font-display text-ai text-2xl"
              : "font-display text-gayoshi text-2xl"
          }
        >
          {formatDateHeading(dateFromKey(date))}
        </h1>
        <Link
          to="/roster"
          className={
            isToday
              ? "text-ai shrink-0 p-2 font-bold underline"
              : "text-gayoshi shrink-0 p-2 font-bold underline"
          }
        >
          名簿へ
        </Link>
      </header>

      <DateStepper
        date={date}
        today={today}
        onChange={changeDate}
        labels={DATE_LABELS}
      />

      {activeTypes.length === 0 ? (
        <div className="py-12 text-center">
          <p>まず提出物を登録してください</p>
          <Link
            to="/submissions"
            className="bg-ai mt-4 inline-block rounded px-4 py-3 font-bold text-gayoshi"
          >
            提出物の設定
          </Link>
        </div>
      ) : todayTypes.length === 0 ? (
        <p className="py-12 text-center">この日が提出日の宿題はありません</p>
      ) : (
        <>
          <SubmissionToggleBar
            types={todayTypes}
            selectedIds={selected}
            onToggle={toggle}
          />

          <ScanResult
            result={result}
            dateLabel={
              isToday ? undefined : formatDateHeading(dateFromKey(date))
            }
          />

          {mode === "camera" ? (
            <CameraView
              state={camera.state}
              message={camera.message}
              videoRef={camera.videoRef}
              canvasRef={camera.canvasRef}
            />
          ) : selected.length === 0 ? (
            <p className="py-8 text-center font-bold">
              チェックする提出物を選んでください
            </p>
          ) : (
            <NumberPad
              students={activeStudents}
              doneIds={doneIds}
              onPick={pick}
            />
          )}

          <button
            type="button"
            onClick={() => setMode(mode === "camera" ? "number" : "camera")}
            className="border-ai text-ai min-h-11 rounded border-2 px-4 py-2 font-bold"
          >
            {mode === "camera" ? "番号でチェック" : "カメラでスキャン"}
          </button>

          <p className="mt-auto pt-4 text-sm">
            {todayTypes
              .map((type) => {
                const count = recorded.filter(
                  (submission) => submission.submissionTypeId === type.id,
                ).length;
                return `${type.name} ${count}人`;
              })
              .join("・")}
          </p>
        </>
      )}
    </main>
  );
}

export function Scan() {
  return (
    <CohortGate>
      <ScanBody />
    </CohortGate>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/screens/Scan.test.tsx`
Expected: PASS（既存17件 + 新規7件）

- [ ] **Step 5: コミット**

```bash
git add src/components/ScanResult.tsx src/screens/Scan.tsx src/screens/Scan.test.tsx
git commit -m "$(cat <<'EOF'
feat: 教員のスキャン画面に日付送りを足す

過去の提出忘れを、後から受け取った日として記録できるようにする。
今日以外を見ている間はヘッダーを藍で反転して合図する(朱は使わない)。
日付を送ったら選択中の提出物と直前の結果を捨てる。今日以外へ
記録したときは結果に対象日を添える。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 児童のスキャン画面に翌日方向の日付送りを足す（`src/screens/KidsScan.tsx`）

**Files:**
- Modify: `src/screens/KidsScan.tsx`
- Modify: `src/screens/KidsScan.test.tsx`

**Interfaces:**
- Consumes: `addDays`（Task 1）、`DateStepper`（Task 2）
- Produces: なし（画面。他から呼ばれない）

**範囲:** `min = today`, `max = addDays(today, 1)`。今日より前へは戻れない。翌日の次へも進めない。

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/KidsScan.test.tsx` の冒頭の `import { toDateKey } from "../lib/date";` を以下に置き換える:

```ts
import { formatDateHeading, toDateKey } from "../lib/date";
```

ファイル末尾（最後の `describe("カメラが使えないとき", ...)` ブロックの後）に新しい `describe` を追加する:

```ts
describe("日付を送る", () => {
  const TOMORROW = new Date(TODAY);
  TOMORROW.setDate(TOMORROW.getDate() + 1);
  const TOMORROW_WEEKDAY = TOMORROW.getDay();

  it("あしたのぶんへ送ると見出しが変わる", async () => {
    const user = userEvent.setup();
    await addType("かんじドリル", [TODAY_WEEKDAY, TOMORROW_WEEKDAY]);
    renderKids();

    await screen.findByText(formatDateHeading(TODAY));
    await user.click(
      await screen.findByRole("button", { name: "あしたのぶん →" }),
    );

    expect(
      await screen.findByText(formatDateHeading(TOMORROW)),
    ).toBeInTheDocument();
  });

  it("きょうより前へは戻れない", async () => {
    await addType("かんじドリル");
    renderKids();

    await screen.findByText(formatDateHeading(TODAY));
    expect(screen.queryByRole("button", { name: "← まえのひ" })).toBeNull();
  });

  it("あしたの次へは進めない", async () => {
    const user = userEvent.setup();
    await addType("かんじドリル", [TODAY_WEEKDAY, TOMORROW_WEEKDAY]);
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: "あしたのぶん →" }),
    );
    await screen.findByText(formatDateHeading(TOMORROW));

    expect(
      screen.queryByRole("button", { name: "あしたのぶん →" }),
    ).toBeNull();
  });

  it("あしたのぶんへ送ると選択が空のまま", async () => {
    const user = userEvent.setup();
    await addType("かんじドリル", [TODAY_WEEKDAY, TOMORROW_WEEKDAY]);
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /かんじドリル/ }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    await user.click(screen.getByRole("button", { name: "あしたのぶん →" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /かんじドリル/ }),
      ).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("あしたを見ているときはヘッダーが反転する", async () => {
    const user = userEvent.setup();
    await addType("かんじドリル", [TODAY_WEEKDAY, TOMORROW_WEEKDAY]);
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: "あしたのぶん →" }),
    );

    const heading = await screen.findByText(formatDateHeading(TOMORROW));
    expect(heading).toHaveClass("text-gayoshi");
  });

  it("あしたに出すものが無ければその旨を伝える", async () => {
    const user = userEvent.setup();
    await addType("かんじドリル", [TODAY_WEEKDAY]); // 今日だけ
    renderKids();

    await screen.findByRole("button", { name: /かんじドリル/ });
    await user.click(screen.getByRole("button", { name: "あしたのぶん →" }));

    expect(
      await screen.findByText("あしたは だすものが ありません"),
    ).toBeInTheDocument();
  });

  it("きょうにもどるボタンで今日に戻れる", async () => {
    const user = userEvent.setup();
    await addType("かんじドリル", [TODAY_WEEKDAY, TOMORROW_WEEKDAY]);
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: "あしたのぶん →" }),
    );
    await screen.findByText(formatDateHeading(TOMORROW));

    await user.click(
      screen.getByRole("button", { name: "← きょうにもどる" }),
    );

    const heading = await screen.findByText(formatDateHeading(TODAY));
    expect(heading).toHaveClass("text-ai");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/screens/KidsScan.test.tsx`
Expected: FAIL — 「あしたのぶん →」ボタンなどが存在しない

- [ ] **Step 3: 実装する**

`src/screens/KidsScan.tsx` を以下の内容で置き換える:

```tsx
import { useRef, useState } from "react";
import { Link } from "react-router";
import { CameraView } from "../components/CameraView";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { DateStepper } from "../components/DateStepper";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { ScanResult } from "../components/ScanResult";
import { SubmissionToggleBar } from "../components/SubmissionToggleBar";
import { recordSubmission, type RecordResult } from "../db/submissions";
import { isDueOn } from "../db/submissionTypes";
import { useQrCamera } from "../hooks/useQrCamera";
import { useSubmissionTypes } from "../hooks/useSubmissionTypes";
import {
  addDays,
  dateFromKey,
  formatDateHeading,
  toDateKey,
} from "../lib/date";
import { parseQrPayload } from "../lib/qr";

const DATE_LABELS = {
  prev: "← まえのひ",
  next: "あしたのぶん →",
  backToToday: "← きょうにもどる",
};

/**
 * 子供が自分でQRをかざす画面。
 *
 * 教員用スキャン（Scan.tsx）との違いは6点。どれも「子供が触る」ことから来る。
 * 1. 提出物の初期選択が空（教員用は今日の分すべて）。何も考えずかざした子が
 *    出していない宿題まで提出済みになるのを防ぐ
 * 2. 記録したら選択を空に戻す。前の子の選択が次の子に引き継がれない
 * 3. 選び始めたら前の結果を消す。誰の花丸か分からなくならないように
 * 4. 番号パッドを出さない。他人の番号を押せてしまう
 * 5. クラス全体の進捗を出さない。それは教員の情報
 * 6. 日付は今日と翌日しか見られない。過去の未提出を自分で埋められない
 *    ようにする（過去分の補正は教員のスキャン画面だけに残す）
 *
 * 生徒一覧を読まないのは、番号パッドが無く、生徒の存在確認は
 * recordSubmission が行うため（notFound / transferredOut を返す）。
 */
function KidsScanBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の日付を今日として固定する（Scan.tsx と同じ理由）。
  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState(today);
  const tomorrow = addDays(today, 1);

  const types = useSubmissionTypes(cohort.id);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [result, setResult] = useState<RecordResult | null>(null);

  // handleScan は selectedIds を参照するが、フックは早期returnより前に
  // 置く必要がある。refで後から差し込む（Scan.tsx と同じ形）。
  const scanHandlerRef = useRef<(payload: string) => void>(() => {});
  const camera = useQrCamera({
    enabled: true,
    onScan: (payload) => scanHandlerRef.current(payload),
  });

  if (types.status === "loading") {
    return <FullScreenMessage>よみこんでいます</FullScreenMessage>;
  }
  if (types.status === "error") {
    // 子供に打つ手が無いので戻る導線を出さない（既定の戻り先は
    // /roster で、それ自身が教員ルート）。
    return (
      <FullScreenMessage tone="error" showBackLink={false}>
        せんせいを よんでください
      </FullScreenMessage>
    );
  }

  const isToday = date === today;

  const todayTypes = types.data
    .filter((type) => type.status === "active")
    .filter((type) => isDueOn(type, date));

  // 日付を送ったら選択と前の結果を捨てる（Scan.tsx と同じ理由）。
  function changeDate(next: string): void {
    setDate(next);
    setSelectedIds([]);
    setResult(null);
  }

  function toggle(id: string): void {
    // 次の子が選び始めたら、前の子の花丸と番号を消す
    setResult(null);
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selected) => selected !== id)
        : [...current, id],
    );
  }

  function handleScan(payload: string): void {
    if (selectedIds.length === 0) {
      return;
    }

    const studentId = parseQrPayload(payload);
    if (studentId === null) {
      // このアプリのQRでなければ黙って無視する。教室で商品バーコードが
      // カメラに入っても止まらない。
      return;
    }

    void recordSubmission({
      cohortId: cohort.id,
      studentId,
      submissionTypeIds: selectedIds,
      date,
    }).then((next) => {
      setResult(next);
      // 次の子のために選び直させる
      setSelectedIds([]);
    });
  }

  scanHandlerRef.current = handleScan;

  const cameraUsable = camera.state === "running" || camera.state === "starting";

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <header
        className={
          isToday
            ? "border-kogan flex items-center justify-between gap-3 border-b pb-3"
            : "bg-ai flex items-center justify-between gap-3 rounded p-3"
        }
      >
        <h1
          className={
            isToday
              ? "font-display text-ai text-2xl"
              : "font-display text-gayoshi text-2xl"
          }
        >
          {formatDateHeading(dateFromKey(date))}
        </h1>
        {/* 先生の入口。目立たせないが、44px四方のタップ領域は確保する */}
        <Link
          to="/roster"
          className={
            isToday
              ? "text-sumi flex size-11 shrink-0 items-center justify-center text-sm"
              : "text-gayoshi flex size-11 shrink-0 items-center justify-center text-sm"
          }
        >
          せんせい
        </Link>
      </header>

      <DateStepper
        date={date}
        today={today}
        onChange={changeDate}
        labels={DATE_LABELS}
        min={today}
        max={tomorrow}
      />

      {todayTypes.length === 0 ? (
        <p className="py-12 text-center text-xl">
          {isToday
            ? "きょうは だすものが ありません"
            : "あしたは だすものが ありません"}
        </p>
      ) : (
        <>
          <SubmissionToggleBar
            types={todayTypes}
            selectedIds={selectedIds}
            onToggle={toggle}
          />

          <ScanResult result={result} />

          {!cameraUsable ? (
            // useQrCamera の文言は「番号でチェックしてください」と促すが、
            // この画面に番号パッドは無い。子供に打つ手が無い指示を出さない。
            <p className="py-8 text-center text-xl font-bold">
              せんせいを よんでください
            </p>
          ) : (
            <>
              {selectedIds.length === 0 && (
                <p className="py-4 text-center text-xl font-bold">
                  だしたものを えらんでね
                </p>
              )}
              <CameraView
                state={camera.state}
                message={camera.message}
                videoRef={camera.videoRef}
                canvasRef={camera.canvasRef}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}

export function KidsScan() {
  return (
    <CohortGate>
      <KidsScanBody />
    </CohortGate>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/screens/KidsScan.test.tsx`
Expected: PASS（既存21件 + 新規7件）

- [ ] **Step 5: わざと壊して確認する**

`min={today}` を一時的に削除する。「きょうより前へは戻れない」テストが、`min` 制約が無くなったことで前日ボタンが出現し落ちることを確認してから、元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/screens/KidsScan.tsx src/screens/KidsScan.test.tsx
git commit -m "$(cat <<'EOF'
feat: 児童のスキャン画面で翌日提出を先取りチェックできるようにする

今日と翌日だけを行き来できる(今日より前へは戻れない)。子供が自分で
過去の提出忘れを埋められないようにするため。過去分の補正は教員の
スキャン画面だけに残す。あしたを見ているときはヘッダーを反転する。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## 最終確認

全タスク完了後、以下を通しで実行する。

- [ ] **全体テスト**

Run: `npm run test:run`
Expected: 全件PASS

- [ ] **ビルド（型チェック含む）**

Run: `npm run build`
Expected: エラー無く完了（`tsc --noEmit` が `any` の混入・未使用importを含めて検査する）

- [ ] **制約の機械的な検査**

```bash
grep -rn "text-shu\|bg-shu\|border-shu" src/components/DateStepper.tsx src/components/ScanResult.tsx src/screens/Scan.tsx src/screens/KidsScan.tsx src/screens/Grading.tsx
```
Expected: 何も出力されない（朱を使っていない）

```bash
grep -rnE "text-(white|black|red|blue|green|yellow|gray|slate)-?[0-9]*\b" src/components/DateStepper.tsx src/components/ScanResult.tsx src/screens/Scan.tsx src/screens/KidsScan.tsx src/screens/Grading.tsx
```
Expected: 何も出力されない（Tailwind素のカラーを使っていない）

```bash
grep -rn ": any\|<any>\|as any" src/components/DateStepper.tsx src/components/ScanResult.tsx src/screens/Scan.tsx src/screens/KidsScan.tsx src/screens/Grading.tsx src/db/grading.ts src/lib/date.ts src/hooks/useGradingItems.ts
```
Expected: 何も出力されない

- [ ] **実機での確認手順への追記**

`docs/手元での確認手順.md` を読み、日付送り3画面（スキャン・児童スキャン・採点）の確認項目が無ければ追記する。
