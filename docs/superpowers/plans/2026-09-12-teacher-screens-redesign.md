# 先生画面の見直し(提出チェック表・採点タブ・山吹) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 未提出者一覧を「全員の状態が1画面で分かる提出チェック表」に、採点画面を「件数付きの2タブ」に作り直し、6色目「山吹」で達成と進捗を見せる。

**Architecture:** DBのストア・インデックスは変えない。表のための読み取りモデル `listDailyRoster` を1つ足し、`Unsubmitted.tsx` をそれに差し替える。`Grading.tsx` はデータ層をそのままに表示だけをタブ化する。色は `index.css` の `@theme` にトークンを2つ足し、Tailwindのクラス(`bg-yamabuki` 等)で使う。

**Tech Stack:** React 19 / react-router 8 / TypeScript strict / Tailwind v4 / IndexedDB(idb) / Vitest + Testing Library + fake-indexeddb

**Spec:** `docs/superpowers/specs/2026-09-12-teacher-screens-redesign-design.md`

## Global Constraints

- ネットワークアクセスを書かない(`fetch`、CDN、外部URL禁止)
- 配色は6トークンのみ: `gayoshi` / `sumi` / `ai` / `kogan` / `shu` / `yamabuki`(+淡色 `yamabuki-usu`)。Tailwind素のカラーを使わない
- **山吹は面(背景)だけ。文字色にしない。** `text-yamabuki` は0件であること。山吹の上の文字は墨(`text-sumi`)
- 朱は花丸(`Hanamaru.tsx`)と `ConfirmDialog` の `tone="danger"` だけ
- 数値は `font-num`、見出しは `font-display`。Klee One を本文に使わない
- UIの文言は日本語。謝罪表現を使わない
- TypeScript strict、`any` 禁止、未使用importでビルドが落ちる(`noUnusedLocals`)
- タップ領域は44px四方以上(`min-h-11` / `size-11`)。出席番号は24pt以上(`text-[2rem]`)
- 375px幅で崩れない。ページ本体を横スクロールさせない(表の入れ物だけ `overflow-x-auto`)
- テストで `vi.useFakeTimers` を使わない。非同期の内容は `waitFor` / `findBy*` で待つ。入力は `fireEvent.change` か `user.type`
- **コミットはタスクごとに行わない。** ユーザーの指示があったときにまとめて行う(各タスクの最後は「全体テスト」で締める)
- 各タスクで、実装前にテストが落ちることを確認する(落ちなければテストを疑う)

---

## ファイル構成

| ファイル | 責務 | 変更 |
|---|---|---|
| `src/styles/index.css` | 配色トークン | `--color-yamabuki`, `--color-yamabuki-usu` を追加 |
| `src/styles/tokens.test.ts` | トークンが消えないことの検査 | 新規 |
| `CLAUDE.md` | 制約の文書 | 配色ルールを6トークンに改定 |
| `src/lib/date.ts` | 日付・時刻の計算 | `minutesUntil` を追加(Unsubmitted.tsx から移動) |
| `src/components/ProgressBar.tsx` | 進捗バー(山吹) | 新規 |
| `src/db/dailyRoster.ts` | 提出チェック表の読み取りモデル | 新規 |
| `src/hooks/useDailyRoster.ts` | 上のフック | 新規 |
| `src/components/CheckTable.tsx` | 提出チェック表 | 新規 |
| `src/screens/Unsubmitted.tsx` | 未提出者一覧画面 | 表に置き換え |
| `src/db/nonSubmitters.ts` | 直近2週間の集計 | `listTodayNonSubmitters` と型を削除 |
| `src/hooks/useTodayNonSubmitters.ts` | (未使用になる) | 削除 |
| `src/screens/Grading.tsx` | 採点画面 | タブ化・「⋯」メニュー・合格を山吹に |
| `docs/手元での確認手順.md` | 実機確認 | 項目を追記 |

---

### Task 1: 山吹トークンとCLAUDE.mdの改定

**Files:**
- Modify: `src/styles/index.css:3-13`
- Modify: `CLAUDE.md`(「譲れない制約」の配色の行)
- Test: `src/styles/tokens.test.ts`(新規)

**Interfaces:**
- Produces: Tailwindクラス `bg-yamabuki`, `bg-yamabuki-usu`(以降のタスクが使う)

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/styles/tokens.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// トークンは index.css の @theme にしか無い。誰かが消したら Tailwind は
// 黙って空のクラスを生成するため、ここで存在を検査する。
const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

describe("配色トークン", () => {
  it("山吹(面)と淡い山吹(地)が定義されている", () => {
    expect(css).toMatch(/--color-yamabuki:\s*#e39b12;/);
    expect(css).toMatch(/--color-yamabuki-usu:\s*#fbeccb;/);
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: FAIL(`--color-yamabuki` が無い)

- [ ] **Step 3: トークンを足す**

`src/styles/index.css` の `@theme` を次にする。

```css
@theme {
  --color-gayoshi: #fbfaf7;
  --color-sumi: #1a1a1f;
  --color-ai: #22406b;
  --color-kogan: #c9d6e4;
  --color-shu: #d8452e;
  /* 提出済み・達成・進捗の面にだけ使う。文字色にしない(画用紙の上で約2.4:1しか無い) */
  --color-yamabuki: #e39b12;
  --color-yamabuki-usu: #fbeccb;

  --font-ui: "BIZ UDPGothic", system-ui, sans-serif;
  --font-num: "BIZ UDGothic", ui-monospace, monospace;
  --font-display: "Klee One", serif;
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: PASS

- [ ] **Step 5: CLAUDE.md の配色の行を書き換える**

「譲れない制約」の配色の箇条書きを次に置き換える。

```markdown
- **配色は6トークンのみ**: 画用紙 `gayoshi` / 墨 `sumi` / 藍 `ai` / 方眼 `kogan` / 朱 `shu` / 山吹 `yamabuki`(+淡色 `yamabuki-usu`)。**Tailwind素のカラー（`text-white` 等）を使わない。** 藍の上に載せる明色は `text-gayoshi`
- **山吹は「提出済み・達成・進捗」の面にだけ使う。** 操作は藍のまま。**山吹を文字色にしない**（画用紙の上ではコントラスト比が約2.4:1で読めない）。山吹の面の上の文字は墨
```

- [ ] **Step 6: 全体テストとビルド**

Run: `npm run test:run && npm run build`
Expected: すべてPASS、ビルド成功

---

### Task 2: 進捗バー `ProgressBar`

**Files:**
- Create: `src/components/ProgressBar.tsx`
- Test: `src/components/ProgressBar.test.tsx`

**Interfaces:**
- Produces: `ProgressBar({ label: string; value: number; max: number })`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
// src/components/ProgressBar.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("提出物名と「提出/在籍」を出す", () => {
    render(<ProgressBar label="計算ドリル" value={28} max={34} />);

    expect(screen.getByText("計算ドリル")).toBeInTheDocument();
    expect(screen.getByText("28/34")).toBeInTheDocument();
  });

  it("progressbar として値を伝える", () => {
    render(<ProgressBar label="計算ドリル" value={28} max={34} />);

    const bar = screen.getByRole("progressbar", { name: "計算ドリル" });
    expect(bar).toHaveAttribute("aria-valuenow", "28");
    expect(bar).toHaveAttribute("aria-valuemax", "34");
  });

  it("全員提出したら数字の代わりに「全員」と出す", () => {
    render(<ProgressBar label="計算ドリル" value={34} max={34} />);

    expect(screen.getByText("全員")).toBeInTheDocument();
    expect(screen.queryByText("34/34")).toBeNull();
  });

  it("在籍0人なら「0/0」で、幅は0%", () => {
    render(<ProgressBar label="計算ドリル" value={0} max={0} />);

    expect(screen.getByText("0/0")).toBeInTheDocument();
    expect(screen.getByTestId("progress-fill")).toHaveStyle({ width: "0%" });
  });

  it("塗りの幅は割合に比例する", () => {
    render(<ProgressBar label="計算ドリル" value={17} max={34} />);

    expect(screen.getByTestId("progress-fill")).toHaveStyle({ width: "50%" });
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/components/ProgressBar.test.tsx`
Expected: FAIL(モジュールが無い)

- [ ] **Step 3: 実装する**

```tsx
// src/components/ProgressBar.tsx
/**
 * 提出物1つぶんの進捗。山吹の面で「できた」の量を見せる。
 * 数字は「提出/在籍」。全員なら「全員」に置き換える(数字を読む手間を省く)。
 */
export function ProgressBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const complete = max > 0 && value >= max;
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);

  return (
    <div className="grid grid-cols-[6em_1fr_4em] items-center gap-2">
      <span className="truncate text-sm font-bold">{label}</span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="bg-kogan h-3 overflow-hidden rounded-full"
      >
        <div
          data-testid="progress-fill"
          className="bg-yamabuki h-full rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-num text-right text-sm font-bold">
        {complete ? "全員" : `${value}/${max}`}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/components/ProgressBar.test.tsx`
Expected: PASS(5件)

- [ ] **Step 5: 全体テスト**

Run: `npm run test:run`
Expected: すべてPASS

---

### Task 3: 提出チェック表の読み取りモデル `listDailyRoster`

**Files:**
- Create: `src/db/dailyRoster.ts`
- Create: `src/hooks/useDailyRoster.ts`
- Test: `src/db/dailyRoster.test.ts`

**Interfaces:**
- Consumes: `listStudents(cohortId)`(出席番号順)、`listSubmissionTypes(cohortId)`、`isDueOn(type, date)`(`src/db/submissionTypes.ts`)、`listSubmissions(cohortId, date)`、`isPastDeadline(date, deadline, now)`(`src/lib/date.ts`)
- Produces:

```ts
export type CellState = "submitted" | "absent" | "none";
export type DailyRosterColumn = {
  type: SubmissionType;
  deadlinePassed: boolean;
  submittedCount: number;
};
export type DailyRosterRow = {
  student: Student;
  cells: Record<string, CellState>; // key は type.id
};
export type DailyRoster = {
  columns: DailyRosterColumn[];
  rows: DailyRosterRow[];
  activeCount: number;
};
export function listDailyRoster(cohortId: string, date: string, now: Date): Promise<DailyRoster>;
export function useDailyRoster(cohortId: string, date: string, now: Date): AsyncState<DailyRoster> & { reload: () => void };
```

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/db/dailyRoster.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { addDateSubmission } from "./dateSubmissions";
import { listDailyRoster } from "./dailyRoster";
import { getDb } from "./schema";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType, endSubmissionType } from "./submissionTypes";
import { markAbsent, recordSubmission } from "./submissions";

useFreshDb();

// 2026-08-24 は月曜。曜日で提出日を決める提出物のテストに使う。
const MONDAY = "2026-08-24";
const NOON = new Date(2026, 7, 24, 12, 0);

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function drill(weekdays = [1, 2, 3, 4, 5]) {
  return addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline: "08:15",
    weekdays,
  });
}

describe("listDailyRoster", () => {
  it("在籍生徒を出席番号順に行にし、転出は含めない", async () => {
    await drill();
    await addStudent({ cohortId, attendanceNumber: 12 });
    await addStudent({ cohortId, attendanceNumber: 3 });
    const out = await addStudent({ cohortId, attendanceNumber: 7 });
    await transferOutStudent(out.id);

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.rows.map((row) => row.student.attendanceNumber)).toEqual([
      3, 12,
    ]);
    expect(roster.activeCount).toBe(2);
  });

  it("その日が提出日でない提出物と終了した提出物は列に出ない", async () => {
    await drill();
    await addSubmissionType({
      cohortId,
      name: "日曜だけ",
      deadline: "08:15",
      weekdays: [0],
    });
    const ended = await addSubmissionType({
      cohortId,
      name: "終わった提出物",
      deadline: "08:15",
      weekdays: [1],
    });
    await endSubmissionType(ended.id);

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.columns.map((column) => column.type.name)).toEqual([
      "計算ドリル",
    ]);
  });

  it("提出済み・欠席・未記録をセルに反映し、提出人数を数える", async () => {
    const type = await drill();
    const a = await addStudent({ cohortId, attendanceNumber: 1 });
    const b = await addStudent({ cohortId, attendanceNumber: 2 });
    await addStudent({ cohortId, attendanceNumber: 3 });
    await recordSubmission({
      cohortId,
      studentId: a.id,
      submissionTypeIds: [type.id],
      date: MONDAY,
    });
    await markAbsent({
      cohortId,
      studentId: b.id,
      submissionTypeId: type.id,
      date: MONDAY,
    });

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.rows.map((row) => row.cells[type.id])).toEqual([
      "submitted",
      "absent",
      "none",
    ]);
    expect(roster.columns[0].submittedCount).toBe(1);
  });

  it("status の無い旧レコードは提出済みとして扱う", async () => {
    const type = await drill();
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    const db = await getDb();
    await db.put("submissions", {
      id: "legacy",
      cohortId,
      studentId: student.id,
      submissionTypeId: type.id,
      date: MONDAY,
      submittedAt: NOON.getTime(),
    });

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.rows[0].cells[type.id]).toBe("submitted");
  });

  it("締切前は deadlinePassed が false、過ぎれば true", async () => {
    await drill();

    const before = await listDailyRoster(
      cohortId,
      MONDAY,
      new Date(2026, 7, 24, 8, 0),
    );
    const after = await listDailyRoster(
      cohortId,
      MONDAY,
      new Date(2026, 7, 24, 8, 30),
    );

    expect(before.columns[0].deadlinePassed).toBe(false);
    expect(after.columns[0].deadlinePassed).toBe(true);
  });

  it("日付指定の提出物は対象日にだけ列に出る", async () => {
    await addDateSubmission({
      cohortId,
      name: "遠足のしおり",
      date: MONDAY,
      deadline: "08:15",
    });

    const onDay = await listDailyRoster(cohortId, MONDAY, NOON);
    const otherDay = await listDailyRoster(cohortId, "2026-08-25", NOON);

    expect(onDay.columns.map((column) => column.type.name)).toEqual([
      "遠足のしおり",
    ]);
    expect(otherDay.columns).toEqual([]);
  });

  it("提出物が無い日は列が空で、行は在籍生徒ぶん出る", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.columns).toEqual([]);
    expect(roster.rows).toHaveLength(1);
    expect(roster.rows[0].cells).toEqual({});
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/db/dailyRoster.test.ts`
Expected: FAIL(モジュールが無い)

- [ ] **Step 3: 読み取りモデルを実装する**

```ts
// src/db/dailyRoster.ts
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
```

```ts
// src/hooks/useDailyRoster.ts
import { listDailyRoster, type DailyRoster } from "../db/dailyRoster";
import { useAsync, type AsyncState } from "./useAsync";

export function useDailyRoster(
  cohortId: string,
  date: string,
  now: Date,
): AsyncState<DailyRoster> & { reload: () => void } {
  return useAsync(
    () => listDailyRoster(cohortId, date, now),
    `daily-roster:${cohortId}:${date}`,
  );
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/db/dailyRoster.test.ts`
Expected: PASS(7件)

- [ ] **Step 5: 全体テストと型チェック**

Run: `npx tsc --noEmit && npm run test:run`
Expected: すべてPASS

---

### Task 4: `minutesUntil` の移動と `CheckTable`

**Files:**
- Modify: `src/lib/date.ts`(末尾に `minutesUntil` を追加)
- Test: `src/lib/date.test.ts`(`minutesUntil` の describe を追加)
- Create: `src/components/CheckTable.tsx`
- Test: `src/components/CheckTable.test.tsx`

**Interfaces:**
- Consumes: `DailyRoster`, `CellState`(Task 3)
- Produces:

```ts
export function minutesUntil(deadline: string, now: Date): number; // src/lib/date.ts
export function CheckTable(props: {
  roster: DailyRoster;
  showNames: boolean;
  now: Date;
  onCellTap: (student: Student, type: SubmissionType, state: "none" | "absent") => void;
}): JSX.Element;
```

- [ ] **Step 1: `minutesUntil` の失敗するテストを書く**

`src/lib/date.test.ts` の末尾に追加する。

```ts
import { minutesUntil } from "./date"; // 既存の import 行に minutesUntil を足す

describe("minutesUntil", () => {
  it("締切までの分数を返す", () => {
    expect(minutesUntil("08:15", new Date(2026, 7, 24, 8, 0))).toBe(15);
  });

  it("時をまたいでも正しい", () => {
    expect(minutesUntil("09:05", new Date(2026, 7, 24, 8, 50))).toBe(15);
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/lib/date.test.ts`
Expected: FAIL(`minutesUntil` が export されていない)

- [ ] **Step 3: `minutesUntil` を `src/lib/date.ts` に足す**

`src/screens/Unsubmitted.tsx:12-18` にある関数をそのまま移す(Unsubmitted.tsx側の削除は Task 5 で行う)。

```ts
/** "HH:mm" の締切まであと何分か。負の値にはならない呼び出し方を前提とする。 */
export function minutesUntil(deadline: string, now: Date): number {
  const [hours, minutes] = deadline.split(":").map(Number);
  const deadlineMinutes = hours * 60 + minutes;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return deadlineMinutes - nowMinutes;
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/lib/date.test.ts`
Expected: PASS

- [ ] **Step 5: `CheckTable` の失敗するテストを書く**

```tsx
// src/components/CheckTable.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DailyRoster } from "../db/dailyRoster";
import type { Student, SubmissionType } from "../db/schema";
import { CheckTable } from "./CheckTable";

const drill: SubmissionType = {
  id: "t-drill",
  cohortId: "c1",
  name: "計算ドリル",
  deadline: "08:15",
  weekdays: [1, 2, 3, 4, 5],
  status: "active",
  order: 1,
  createdAt: 0,
};
const reading: SubmissionType = { ...drill, id: "t-reading", name: "音読カード", order: 2 };

function student(number: number, name = ""): Student {
  return {
    id: `s${number}`,
    cohortId: "c1",
    attendanceNumber: number,
    name,
    status: "active",
    createdAt: 0,
  };
}

const roster: DailyRoster = {
  columns: [
    { type: drill, deadlinePassed: false, submittedCount: 1 },
    { type: reading, deadlinePassed: true, submittedCount: 2 },
  ],
  rows: [
    { student: student(1, "青木"), cells: { [drill.id]: "submitted", [reading.id]: "submitted" } },
    { student: student(2, "石田"), cells: { [drill.id]: "none", [reading.id]: "submitted" } },
    { student: student(3, "上田"), cells: { [drill.id]: "absent", [reading.id]: "none" } },
  ],
  activeCount: 3,
};

// 締切 08:15 に対して 08:00。「あと15分」になる。
const NOW = new Date(2026, 7, 24, 8, 0);

describe("CheckTable", () => {
  it("在籍生徒の行を全員ぶん出し、列見出しに人数を出す", () => {
    render(
      <CheckTable roster={roster} showNames={false} now={NOW} onCellTap={vi.fn()} />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(4); // 見出し1 + 生徒3
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("締切前は「あと◯分」、過ぎていれば「確定」を列見出しに出す", () => {
    render(
      <CheckTable roster={roster} showNames={false} now={NOW} onCellTap={vi.fn()} />,
    );

    expect(screen.getByText("あと15分")).toBeInTheDocument();
    expect(screen.getByText("確定")).toBeInTheDocument();
  });

  it("提出済みのセルはボタンではなく、押せない", () => {
    render(
      <CheckTable roster={roster} showNames={false} now={NOW} onCellTap={vi.fn()} />,
    );

    const cell = screen.getByRole("img", { name: "1番 計算ドリル 提出済み" });
    expect(cell.tagName).not.toBe("BUTTON");
  });

  it("未提出のセルを押すと onCellTap に none で渡す", async () => {
    const user = userEvent.setup();
    const onCellTap = vi.fn();
    render(
      <CheckTable roster={roster} showNames={false} now={NOW} onCellTap={onCellTap} />,
    );

    await user.click(screen.getByRole("button", { name: "2番 計算ドリル 未提出" }));

    expect(onCellTap).toHaveBeenCalledWith(roster.rows[1].student, drill, "none");
  });

  it("欠席のセルを押すと onCellTap に absent で渡す", async () => {
    const user = userEvent.setup();
    const onCellTap = vi.fn();
    render(
      <CheckTable roster={roster} showNames={false} now={NOW} onCellTap={onCellTap} />,
    );

    await user.click(screen.getByRole("button", { name: "3番 計算ドリル 欠席" }));

    expect(onCellTap).toHaveBeenCalledWith(roster.rows[2].student, drill, "absent");
  });

  it("showNames が true のときだけ氏名を出す", () => {
    const { rerender } = render(
      <CheckTable roster={roster} showNames={false} now={NOW} onCellTap={vi.fn()} />,
    );
    expect(screen.queryByText("青木")).toBeNull();

    rerender(
      <CheckTable roster={roster} showNames={true} now={NOW} onCellTap={vi.fn()} />,
    );
    expect(screen.getByText("青木")).toBeInTheDocument();
  });

  it("行見出しの出席番号は24pt以上の数字書体で出す", () => {
    render(
      <CheckTable roster={roster} showNames={false} now={NOW} onCellTap={vi.fn()} />,
    );

    const rowHeader = screen.getAllByRole("rowheader")[0];
    const number = within(rowHeader).getByText("1");
    expect(number).toHaveClass("font-num", "text-[2rem]");
  });
});
```

- [ ] **Step 6: 落ちることを確認する**

Run: `npx vitest run src/components/CheckTable.test.tsx`
Expected: FAIL(モジュールが無い)

- [ ] **Step 7: `CheckTable` を実装する**

```tsx
// src/components/CheckTable.tsx
import type { CellState, DailyRoster } from "../db/dailyRoster";
import type { Student, SubmissionType } from "../db/schema";
import { minutesUntil } from "../lib/date";

/**
 * 提出チェック表。縦に在籍生徒、横にその日の提出物。
 *
 * 幅の式(375px幅、内寸343px):
 *   生徒列 96px(w-24) + 提出物列 (セル44px + 左右のpadding 4px×2 = 52px) × N
 *   N=3: 252px / N=4: 304px / N=5: 356px
 * 5列以上は外側の overflow-x-auto の中だけ横に流れ、生徒列は sticky で残る。
 * ページ本体は横に動かさない。列幅を変えるときはこの式を計算し直すこと。
 *
 * 提出済みのセルは押せない。取り消しはスキャン画面と採点画面の役割で、
 * この画面に削除を持ち込まない。
 */
export function CheckTable({
  roster,
  showNames,
  now,
  onCellTap,
}: {
  roster: DailyRoster;
  showNames: boolean;
  now: Date;
  onCellTap: (
    student: Student,
    type: SubmissionType,
    state: "none" | "absent",
  ) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-kogan border-b align-bottom">
            <th
              scope="col"
              className="bg-gayoshi sticky left-0 w-24 pb-2 text-left text-sm font-bold"
            >
              生徒
            </th>
            {roster.columns.map((column) => (
              <th
                key={column.type.id}
                scope="col"
                className="px-1 pb-2 text-center text-sm font-bold"
              >
                <span className="block">{column.type.name}</span>
                <span className="font-num block">
                  {column.submittedCount}/{roster.activeCount}
                </span>
                <span
                  className={
                    column.deadlinePassed
                      ? "bg-sumi mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold text-gayoshi"
                      : "border-ai text-ai mt-1 inline-block rounded border px-2 py-0.5 text-xs font-bold"
                  }
                >
                  {column.deadlinePassed
                    ? "確定"
                    : `あと${minutesUntil(column.type.deadline, now)}分`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roster.rows.map((row) => (
            <tr key={row.student.id} className="border-kogan border-b">
              <th
                scope="row"
                className="bg-gayoshi sticky left-0 py-1 text-left font-normal"
              >
                <span className="font-num text-[2rem] leading-none font-bold">
                  {row.student.attendanceNumber}
                </span>
                {showNames && row.student.name !== "" && (
                  <span className="ml-1 text-sm">{row.student.name}</span>
                )}
              </th>
              {roster.columns.map((column) => (
                <td key={column.type.id} className="px-1 py-1 text-center">
                  <Cell
                    state={row.cells[column.type.id] ?? "none"}
                    label={`${row.student.attendanceNumber}番 ${column.type.name}`}
                    onTap={(state) => onCellTap(row.student, column.type, state)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  state,
  label,
  onTap,
}: {
  state: CellState;
  label: string;
  onTap: (state: "none" | "absent") => void;
}) {
  if (state === "submitted") {
    return (
      <span
        role="img"
        aria-label={`${label} 提出済み`}
        className="bg-yamabuki-usu text-sumi font-num inline-flex size-11 items-center justify-center rounded text-xl font-bold"
      >
        ✓
      </span>
    );
  }

  if (state === "absent") {
    return (
      <button
        type="button"
        aria-label={`${label} 欠席`}
        data-status="absent"
        onClick={() => onTap("absent")}
        className="border-kogan text-kogan hatch font-num inline-flex size-11 items-center justify-center rounded border-2 border-dashed text-sm font-bold"
      >
        欠
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={`${label} 未提出`}
      data-status="none"
      onClick={() => onTap("none")}
      className="border-kogan inline-flex size-11 rounded border-2"
    />
  );
}
```

- [ ] **Step 8: 通ることを確認する**

Run: `npx vitest run src/components/CheckTable.test.tsx`
Expected: PASS(7件)

- [ ] **Step 9: 全体テストと型チェック**

Run: `npx tsc --noEmit && npm run test:run`
Expected: すべてPASS(`Unsubmitted.tsx` 側の `minutesUntil` はまだ残っていてよい。同名の別関数だが import していないので衝突しない)

---

### Task 5: 未提出者一覧を提出チェック表に置き換える

**Files:**
- Modify: `src/screens/Unsubmitted.tsx`(全面書き換え)
- Modify: `src/screens/Unsubmitted.test.tsx`(全面書き換え)

**Interfaces:**
- Consumes: `useDailyRoster`(Task 3)、`CheckTable`(Task 4)、`ProgressBar`(Task 2)、`useSetting("showStudentNames")`、`markAbsent` / `unmarkAbsent`、`useRecentNonSubmissionCounts`、`ConfirmDialog`、`DateStepper`
- Produces: 画面。URL `/unsubmitted` と名簿からの導線の文言は変えない

- [ ] **Step 1: テストを全面的に書き換える(先に落とす)**

`src/screens/Unsubmitted.test.tsx` を次の内容に置き換える。

```tsx
import { useFreshDb } from "../test/db";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import { setSetting } from "../db/settings";
import { addStudent, transferOutStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { markAbsent, recordSubmission } from "../db/submissions";
import { toDateKey } from "../lib/date";
import * as submissionsModule from "../db/submissions";

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
  return renderAsTeacher(path);
}

function drill(deadline = "23:59") {
  return addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline,
    weekdays: [todayWeekday],
  });
}

describe("提出チェック表", () => {
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

  it("在籍生徒を全員、出席番号順に行として出す", async () => {
    await drill();
    await addStudent({ cohortId, attendanceNumber: 12 });
    await addStudent({ cohortId, attendanceNumber: 3 });

    renderAt("/unsubmitted");

    const headers = await screen.findAllByRole("rowheader");
    expect(headers.map((header) => header.textContent)).toEqual(["3", "12"]);
  });

  it("提出済み・未提出・欠席をセルで出し、列見出しに人数を出す", async () => {
    const type = await drill();
    const a = await addStudent({ cohortId, attendanceNumber: 1 });
    const b = await addStudent({ cohortId, attendanceNumber: 2 });
    await addStudent({ cohortId, attendanceNumber: 3 });
    await recordSubmission({
      cohortId,
      studentId: a.id,
      submissionTypeIds: [type.id],
      date: todayKey,
    });
    await markAbsent({
      cohortId,
      studentId: b.id,
      submissionTypeId: type.id,
      date: todayKey,
    });

    renderAt("/unsubmitted");

    expect(
      await screen.findByRole("img", { name: "1番 計算ドリル 提出済み" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "2番 計算ドリル 欠席" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "3番 計算ドリル 未提出" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("1/3").length).toBeGreaterThan(0);
  });

  it("締切前は残り時間、締切後は確定を出す", async () => {
    await drill("23:59");
    await addSubmissionType({
      cohortId,
      name: "朝の提出物",
      deadline: "00:00",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    renderAt("/unsubmitted");

    expect(await screen.findByText(/^あと\d+分$/)).toBeInTheDocument();
    expect(screen.getByText("確定")).toBeInTheDocument();
  });

  it("転出した生徒は行に出ない", async () => {
    await drill();
    const out = await addStudent({ cohortId, attendanceNumber: 9 });
    await transferOutStudent(out.id);
    await addStudent({ cohortId, attendanceNumber: 1 });

    renderAt("/unsubmitted");

    await screen.findAllByRole("rowheader");
    expect(screen.queryByText("9")).toBeNull();
  });

  it("全員提出した提出物は帯で知らせる", async () => {
    const type = await drill();
    const a = await addStudent({ cohortId, attendanceNumber: 1 });
    await recordSubmission({
      cohortId,
      studentId: a.id,
      submissionTypeIds: [type.id],
      date: todayKey,
    });

    renderAt("/unsubmitted");

    expect(await screen.findByText("計算ドリル 全員提出")).toBeInTheDocument();
    expect(screen.getByText("全員")).toBeInTheDocument();
  });

  it("氏名は設定に従う", async () => {
    await drill();
    await addStudent({ cohortId, attendanceNumber: 1, name: "青木" });
    await setSetting("showStudentNames", true);

    renderAt("/unsubmitted");

    expect(await screen.findByText("青木")).toBeInTheDocument();
  });
});

describe("欠席マーク", () => {
  it("未提出のセルをタップして欠席にできる", async () => {
    const user = userEvent.setup();
    await drill();
    await addStudent({ cohortId, attendanceNumber: 5 });

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "5番 計算ドリル 未提出" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "欠席にする" }),
    );

    expect(
      await screen.findByRole("button", { name: "5番 計算ドリル 欠席" }),
    ).toBeInTheDocument();
  });

  it("欠席のセルをタップして取り消せる", async () => {
    const user = userEvent.setup();
    const type = await drill();
    const student = await addStudent({ cohortId, attendanceNumber: 5 });
    await markAbsent({
      cohortId,
      studentId: student.id,
      submissionTypeId: type.id,
      date: todayKey,
    });

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "5番 計算ドリル 欠席" }),
    );
    await user.click(await screen.findByRole("button", { name: "取り消す" }));

    expect(
      await screen.findByRole("button", { name: "5番 計算ドリル 未提出" }),
    ).toBeInTheDocument();
  });

  it("やめるを押すと何も変わらない", async () => {
    const user = userEvent.setup();
    await drill();
    await addStudent({ cohortId, attendanceNumber: 5 });

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "5番 計算ドリル 未提出" }),
    );
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect(
      await screen.findByRole("button", { name: "5番 計算ドリル 未提出" }),
    ).toBeInTheDocument();
  });

  it("欠席にすると直近2週間の集計から除外される", async () => {
    const user = userEvent.setup();
    await drill("00:00");
    await addStudent({ cohortId, attendanceNumber: 4 });

    renderAt("/unsubmitted");

    const ranking = await screen.findByRole("list", { name: "直近2週間で未提出が多い生徒" });
    expect(within(ranking).getByText("4番")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "4番 計算ドリル 未提出" }));
    await user.click(await screen.findByRole("button", { name: "欠席にする" }));

    expect(await screen.findByText("未提出はありません")).toBeInTheDocument();
  });

  it("保存に失敗したらエラーを表示し、セルは変わらない", async () => {
    const user = userEvent.setup();
    await drill();
    await addStudent({ cohortId, attendanceNumber: 6 });

    const spy = vi
      .spyOn(submissionsModule, "markAbsent")
      .mockRejectedValueOnce(new Error("ストレージにアクセスできません"));

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "6番 計算ドリル 未提出" }),
    );
    await user.click(await screen.findByRole("button", { name: "欠席にする" }));

    expect(
      await screen.findByText("ストレージにアクセスできません"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "6番 計算ドリル 未提出" }),
    ).toBeInTheDocument();

    spy.mockRestore();
  });
});

describe("直近2週間の集計", () => {
  it("未提出が無ければ案内を出す", async () => {
    renderAt("/unsubmitted");

    expect(await screen.findByText("未提出はありません")).toBeInTheDocument();
  });

  it("今日の未提出は集計にも反映される", async () => {
    await drill("00:00");
    await addStudent({ cohortId, attendanceNumber: 4 });

    renderAt("/unsubmitted");

    const ranking = await screen.findByRole("list", { name: "直近2週間で未提出が多い生徒" });
    expect(within(ranking).getByText("4番")).toBeInTheDocument();
    expect(within(ranking).getByText("1回")).toBeInTheDocument();
  });
});

describe("日付送り", () => {
  it("日付を前へ送ると、その日の表に切り替わる", async () => {
    const user = userEvent.setup();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "23:59",
      weekdays: [yesterday.getDay()],
    });
    await addStudent({ cohortId, attendanceNumber: 8 });

    renderAt("/unsubmitted");
    await screen.findByText("今日は確認する提出物がありません");

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    expect(
      await screen.findByRole("button", { name: "8番 日記 未提出" }),
    ).toBeInTheDocument();
  });

  it("今日以外を見ているときは見出しと案内の文言が変わる", async () => {
    const user = userEvent.setup();
    renderAt("/unsubmitted");

    await screen.findByText("今日の提出状況");
    await user.click(screen.getByRole("button", { name: "← 前日" }));

    expect(await screen.findByText("この日の提出状況")).toBeInTheDocument();
    expect(
      await screen.findByText("この日は確認する提出物がありません"),
    ).toBeInTheDocument();
  });

  it("日付を送っても画面の外枠は消えない", async () => {
    const user = userEvent.setup();
    renderAt("/unsubmitted");

    await screen.findByText("今日の提出状況");
    await user.click(screen.getByRole("button", { name: "← 前日" }));

    // 読み込み中も DateStepper は残る(全画面の読み込み表示に戻らない)
    expect(screen.getByRole("button", { name: "今日へ" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("この日の提出状況")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/screens/Unsubmitted.test.tsx`
Expected: FAIL(rowheader が無い、`1番 計算ドリル 提出済み` が無い等。「今日提出日の提出物が無ければ案内を出す」「未提出が無ければ案内を出す」の2件は通ってよい)

- [ ] **Step 3: `Unsubmitted.tsx` を書き換える**

```tsx
// src/screens/Unsubmitted.tsx
import { useState } from "react";
import { Link } from "react-router";
import { CheckTable } from "../components/CheckTable";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DateStepper } from "../components/DateStepper";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { ProgressBar } from "../components/ProgressBar";
import type { Student, SubmissionType } from "../db/schema";
import { markAbsent, unmarkAbsent } from "../db/submissions";
import { useDailyRoster } from "../hooks/useDailyRoster";
import { useRecentNonSubmissionCounts } from "../hooks/useRecentNonSubmissionCounts";
import { useSetting } from "../hooks/useSetting";
import { dateFromKey, formatDateHeading, toDateKey } from "../lib/date";

type Pending = {
  studentId: string;
  submissionTypeId: string;
  attendanceNumber: number;
  action: "markAbsent" | "unmarkAbsent";
};

const DATE_LABELS = { prev: "← 前日", next: "翌日 →", backToToday: "今日へ" };

const EMPTY_ROSTER = { columns: [], rows: [], activeCount: 0 };

function UnsubmittedBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の時刻で固定する。Scan画面と同じ理由:
  // 朝の数分で使い切る画面で、開きっぱなしを想定しない。日付送りで見ている
  // date はこれとは別に動く。
  const [now] = useState(() => new Date());
  const [today] = useState(() => toDateKey(now));
  const [date, setDate] = useState(today);
  const isToday = date === today;

  const roster = useDailyRoster(cohort.id, date, now);
  const counts = useRecentNonSubmissionCounts(cohort.id, date, now);
  const showNames = useSetting("showStudentNames");

  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (roster.status === "error") {
    return <FullScreenMessage tone="error">{roster.message}</FullScreenMessage>;
  }
  if (counts.status === "error") {
    return <FullScreenMessage tone="error">{counts.message}</FullScreenMessage>;
  }

  // 再読み込み中は前回の一覧が無いので空として扱う。日付を送るたびに
  // 全画面の読み込み表示に戻すと、ヘッダーとDateStepperごと消えて
  // 押した直後の位置が分からなくなる(Grading.tsx・Scan.tsxと同じ理由)。
  const rosterData = roster.status === "ready" ? roster.data : EMPTY_ROSTER;
  const countsData = counts.status === "ready" ? counts.data : [];

  const completed = rosterData.columns.filter(
    (column) =>
      rosterData.activeCount > 0 &&
      column.submittedCount >= rosterData.activeCount,
  );

  function changeDate(next: string): void {
    setDate(next);
    setPending(null);
    setError(null);
  }

  function reload(): void {
    roster.reload();
    counts.reload();
  }

  function handleCellTap(
    student: Student,
    type: SubmissionType,
    state: "none" | "absent",
  ): void {
    setPending({
      studentId: student.id,
      submissionTypeId: type.id,
      attendanceNumber: student.attendanceNumber,
      action: state === "absent" ? "unmarkAbsent" : "markAbsent",
    });
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
    setError(null);
    void action
      .then(reload)
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
      });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <h1 className="font-display text-ai text-2xl">
          {formatDateHeading(dateFromKey(date))}
        </h1>
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

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-ai text-xl">
          {isToday ? "今日の提出状況" : "この日の提出状況"}
        </h2>

        {rosterData.columns.length === 0 ? (
          <p>
            {isToday
              ? "今日は確認する提出物がありません"
              : "この日は確認する提出物がありません"}
          </p>
        ) : (
          <>
            {completed.map((column) => (
              <p
                key={column.type.id}
                className="bg-yamabuki text-sumi rounded px-3 py-2 font-bold"
              >
                {column.type.name} 全員提出
              </p>
            ))}

            <div className="flex flex-col gap-2">
              {rosterData.columns.map((column) => (
                <ProgressBar
                  key={column.type.id}
                  label={column.type.name}
                  value={column.submittedCount}
                  max={rosterData.activeCount}
                />
              ))}
            </div>

            <CheckTable
              roster={rosterData}
              showNames={showNames.value}
              now={now}
              onCellTap={handleCellTap}
            />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 id="recent-heading" className="font-display text-ai text-xl">
          直近2週間で未提出が多い生徒
        </h2>

        {countsData.length === 0 ? (
          <p>未提出はありません</p>
        ) : (
          <ul aria-labelledby="recent-heading" className="flex flex-col gap-2">
            {countsData.map(({ student, count }) => (
              <li
                key={student.id}
                className="border-kogan flex items-center justify-between border-b pb-2"
              >
                <span className="font-num font-bold">
                  {student.attendanceNumber}番
                  {showNames.value && student.name !== ""
                    ? ` ${student.name}`
                    : ""}
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
          onCancel={() => {
            setPending(null);
            setError(null);
          }}
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

注意: `EMPTY_ROSTER` はモジュール定数にして、毎レンダー新しい配列を作らない。ランキングの `<ul>` に `aria-labelledby` を付けたのは、テストが `getByRole("list", { name })` で表とランキングを区別するため(表の中には `<ul>` が無いが、将来のために名前で引く)。

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/screens/Unsubmitted.test.tsx`
Expected: PASS(16件)

- [ ] **Step 5: 型チェックと全体テスト**

Run: `npx tsc --noEmit && npm run test:run`
Expected: すべてPASS(`useTodayNonSubmitters` は未使用になるが、export は `noUnusedLocals` の対象外なのでビルドは通る。削除は Task 6)

---

### Task 6: `listTodayNonSubmitters` の削除

**Files:**
- Delete: `src/hooks/useTodayNonSubmitters.ts`
- Modify: `src/db/nonSubmitters.ts`(`TodayNonSubmitterGroup` 型と `listTodayNonSubmitters` 関数を削除。`countRecentNonSubmissions` と `NonSubmissionCount` は残す)
- Modify: `src/db/nonSubmitters.test.ts`(`describe("listTodayNonSubmitters", ...)` のブロック全体を削除)

**Interfaces:**
- Consumes: なし
- Produces: なし(`src/db/nonSubmitters.ts` の export は `NonSubmissionCount` と `countRecentNonSubmissions` だけになる)

- [ ] **Step 1: 参照が残っていないことを確認する**

Run: `grep -rn "useTodayNonSubmitters\|listTodayNonSubmitters\|TodayNonSubmitterGroup" src`
Expected: `src/hooks/useTodayNonSubmitters.ts`、`src/db/nonSubmitters.ts`、`src/db/nonSubmitters.test.ts` の3ファイルだけ(Task 5 で `Unsubmitted.tsx` からは消えている)

- [ ] **Step 2: 削除する**

```bash
rm src/hooks/useTodayNonSubmitters.ts
```

`src/db/nonSubmitters.ts` から次を消す。

- `export type TodayNonSubmitterGroup = { ... };`(12〜18行目)
- `export async function listTodayNonSubmitters(...) { ... }`(20〜67行目)
- 不要になった import(`isDueOn` は `countRecentNonSubmissions` が使うので残す。`listSubmissions` は使わなくなるので消す。`Student`/`SubmissionType` 型の import は `NonSubmissionCount` が `Student` を使うので `Student` だけ残す)

`src/db/nonSubmitters.test.ts` から `describe("listTodayNonSubmitters", () => { ... });` のブロック(29〜277行目)を消し、そのブロックでしか使っていない import があれば消す。

- [ ] **Step 3: 型チェックと全体テスト**

Run: `npx tsc --noEmit && npm run test:run`
Expected: すべてPASS。`noUnusedLocals` で落ちたら、その import を消す

---

### Task 7: 採点画面をタブにする

**Files:**
- Modify: `src/screens/Grading.tsx`
- Modify: `src/screens/Grading.test.tsx`

**Interfaces:**
- Consumes: `useGradingItems`(既存)、`ConfirmDialog`、`deleteSubmission`、`gradeSubmission`、`clearGrade`
- Produces: 画面。`GradingRow` の props は `{ item, onGrade, onClear?, onWithdraw?, menuOpen, onToggleMenu }` になる

- [ ] **Step 1: テストを直す(先に落とす)**

`src/screens/Grading.test.tsx` に次の変更を入れる。

(a) 新しいテストを `describe("採点画面", ...)` の先頭に追加する。

```tsx
  it("未採点と再提出待ちのタブに件数が出る", async () => {
    renderAsTeacher("/grading");

    const ungraded = await screen.findByRole("tab", { name: /未採点/ });
    expect(ungraded).toHaveAttribute("aria-selected", "true");
    expect(within(ungraded).getByText("1")).toBeInTheDocument();

    const resubmit = screen.getByRole("tab", { name: /再提出待ち/ });
    expect(resubmit).toHaveAttribute("aria-selected", "false");
    expect(within(resubmit).getByText("0")).toBeInTheDocument();
  });

  it("タブを切り替えると表示が変わる", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await screen.findByText("計算ドリル");
    await user.click(screen.getByRole("tab", { name: /再提出待ち/ }));

    expect(
      screen.getByRole("tab", { name: /再提出待ち/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("再提出待ちの生徒はいません")).toBeInTheDocument();
    expect(screen.queryByText("計算ドリル")).toBeNull();
  });

  it("提出物の見出しに残り件数が出る", async () => {
    renderAsTeacher("/grading");

    expect(await screen.findByText("あと1件")).toBeInTheDocument();
  });

  it("未採点が0件なら山吹の帯で知らせる", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を合格にする",
      }),
    );

    const band = await screen.findByText("未採点の提出物はありません");
    expect(band).toHaveClass("bg-yamabuki");
  });
```

`within` を `@testing-library/react` の import に足す。

(b) 「⋯」経由に変える。以下の5つのテストを次の内容に置き換える。

```tsx
  it("未採点の行には「⋯」があり、押すと「提出を取り消す」が出る", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）のその他の操作",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）の提出を取り消す",
      }),
    ).toBeInTheDocument();
  });

  it("再提出待ちの行には「⋯」を出さない", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を再提出にする",
      }),
    );
    await user.click(screen.getByRole("tab", { name: /再提出待ち/ }));
    await screen.findByRole("button", {
      name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
    });

    expect(
      screen.queryByRole("button", { name: /のその他の操作/ }),
    ).toBeNull();
  });

  it("「⋯」から提出を取り消すと確認ダイアログが出る", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）のその他の操作",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）の提出を取り消す",
      }),
    );

    expect(
      await screen.findByText("提出を取り消しますか"),
    ).toBeInTheDocument();
  });

  it("やめるを押すと何も変わらない", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）のその他の操作",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）の提出を取り消す",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を合格にする",
      }),
    ).toBeInTheDocument();
    expect(await listSubmissions(cohortId, "2026-08-24")).toHaveLength(1);
  });

  it("取り消すを押すと記録が完全に削除され未採点セクションから消える", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）のその他の操作",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）の提出を取り消す",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "取り消す" }));

    await waitFor(() => {
      expect(
        screen.getByText("未採点の提出物はありません"),
      ).toBeInTheDocument();
    });
    expect(await listSubmissions(cohortId, "2026-08-24")).toHaveLength(0);
  });
```

(c) 再提出待ちの行を見るテストに、タブの切り替えを入れる。対象と挿入位置:

- 「再提出にすると再提出待ちセクションに移る」: `waitFor` の中の2つ目の `expect`(未採点に戻すボタン)を外に出し、その前に `await user.click(screen.getByRole("tab", { name: /再提出待ち/ }));` を入れる。つまり

```tsx
    await waitFor(() => {
      expect(
        screen.getByText("未採点の提出物はありません"),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /再提出待ち/ }));
    expect(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
      }),
    ).toBeInTheDocument();
```

- 「再提出待ちから未採点に戻せる」: 「再提出にする」を押した直後に `await user.click(screen.getByRole("tab", { name: /再提出待ち/ }));` を入れる。「未採点に戻す」を押した後、`waitFor` の前に `await user.click(screen.getByRole("tab", { name: /未採点/ }));` を入れる(戻した行は未採点タブに現れる)。`waitFor` の中の「再提出待ちの生徒はいません」の `expect` は消す(別タブなので見えない)
- 「再提出待ちから合格にできる」: 「再提出にする」の直後にタブ切り替えを入れる。最後の `waitFor` はそのまま(再提出待ちタブに居るので「再提出待ちの生徒はいません」が見える)
- 「再提出待ちは日付を送っても表示され続ける」: 「再提出にする」の直後にタブ切り替えを入れる。それ以外はそのまま
- 「受け取った日が違う再提出待ちを未採点に戻すと、その受け取った日へ移る」: `renderAsTeacher` の直後に `await user.click(await screen.findByRole("tab", { name: /再提出待ち/ }));` を入れる。「未採点に戻す」を押した後、`waitFor` の前に `await user.click(screen.getByRole("tab", { name: /未採点/ }));` を入れる

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/screens/Grading.test.tsx`
Expected: FAIL(`role="tab"` が無い、「のその他の操作」が無い)

- [ ] **Step 3: `Grading.tsx` を書き換える**

`GradingRow` を次に置き換える。

```tsx
function GradingRow({
  item,
  onGrade,
  onClear,
  onWithdraw,
  menuOpen,
  onToggleMenu,
}: {
  item: GradingItem;
  onGrade: (id: string, grade: "passed" | "resubmit") => void;
  onClear?: (item: GradingItem) => void;
  onWithdraw?: (item: GradingItem) => void;
  menuOpen: boolean;
  onToggleMenu: (id: string) => void;
}) {
  const { submission, student } = item;
  const dateLabel = formatDateHeading(dateFromKey(submission.date));
  const timing = submissionTiming(submission.date, submission.submittedAt);
  const timingLabel =
    timing === "late" ? "遅れて提出" : timing === "early" ? "先に提出" : "";
  const who = `${dateLabel}の${student.attendanceNumber}番（${item.type.name}）`;

  return (
    <li className="border-kogan flex flex-col border-b py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <span className="font-num text-[2rem] leading-none font-bold">
            {student.attendanceNumber}
          </span>
          {student.name !== "" && <span className="text-sm">{student.name}</span>}
          {timingLabel !== "" && (
            <span className="text-sm">・{timingLabel}</span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={`${who}を合格にする`}
            onClick={() => onGrade(submission.id, "passed")}
            className="bg-yamabuki text-sumi min-h-11 rounded px-3 font-bold"
          >
            合格
          </button>
          {onClear === undefined ? (
            <button
              type="button"
              aria-label={`${who}を再提出にする`}
              onClick={() => onGrade(submission.id, "resubmit")}
              className="border-ai text-ai min-h-11 rounded border-2 px-3 font-bold"
            >
              再提出
            </button>
          ) : (
            <button
              type="button"
              aria-label={`${who}を未採点に戻す`}
              onClick={() => onClear(item)}
              className="text-ai min-h-11 px-3 font-bold underline"
            >
              未採点に戻す
            </button>
          )}
          {onWithdraw !== undefined && (
            <button
              type="button"
              aria-label={`${who}のその他の操作`}
              aria-expanded={menuOpen}
              onClick={() => onToggleMenu(submission.id)}
              className="text-ai size-11 rounded font-bold"
            >
              ⋯
            </button>
          )}
        </div>
      </div>
      {onWithdraw !== undefined && menuOpen && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            aria-label={`${who}の提出を取り消す`}
            onClick={() => onWithdraw(item)}
            className="text-ai min-h-11 px-3 font-bold underline"
          >
            提出を取り消す
          </button>
        </div>
      )}
    </li>
  );
}
```

日付は行から外す(タブと見出しの日付で分かる。見出し内の `submission.date` は `who` に残しているので読み上げでは区別できる)。ただし再提出待ちは日付をまたぐので、再提出待ちタブの行だけは日付を出す。そのため `GradingRow` の `<span className="flex items-baseline gap-2">` の先頭に次を入れる。

```tsx
          {onClear !== undefined && (
            <span className="font-num text-sm">{dateLabel}</span>
          )}
```

`GradingBody` の状態と描画を次のように変える。

```tsx
type Tab = "ungraded" | "resubmit";

function GradingBody() {
  const cohort = useActiveCohort();
  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState(today);
  const items = useGradingItems(cohort.id, date);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("ungraded");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingWithdraw, setPendingWithdraw] = useState<GradingItem | null>(
    null,
  );

  // ... items.status === "error" の早期return、changeDate / grade / clear / withdraw は現行のまま ...

  function toggleMenu(id: string): void {
    setOpenMenuId((current) => (current === id ? null : id));
  }

  function requestWithdraw(item: GradingItem): void {
    setOpenMenuId(null);
    setPendingWithdraw(item);
  }

  // data / ungradedGroups / resubmitGroups / oldestUngradedDate は現行のまま

  const tabClass = (selected: boolean) =>
    [
      "flex min-h-11 flex-1 items-center justify-center gap-2 rounded font-bold",
      selected ? "bg-ai text-gayoshi" : "border-ai text-ai border-2",
    ].join(" ");

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      {/* header と DateStepper と error は現行のまま */}

      <div role="tablist" aria-label="採点の区分" className="flex gap-2">
        <button
          role="tab"
          id="tab-ungraded"
          type="button"
          aria-selected={tab === "ungraded"}
          aria-controls="panel-ungraded"
          onClick={() => setTab("ungraded")}
          className={tabClass(tab === "ungraded")}
        >
          未採点
          <span className="bg-yamabuki text-sumi font-num rounded-full px-2 text-sm">
            {data.ungraded.length}
          </span>
        </button>
        <button
          role="tab"
          id="tab-resubmit"
          type="button"
          aria-selected={tab === "resubmit"}
          aria-controls="panel-resubmit"
          onClick={() => setTab("resubmit")}
          className={tabClass(tab === "resubmit")}
        >
          再提出待ち
          <span className="bg-yamabuki text-sumi font-num rounded-full px-2 text-sm">
            {data.resubmitPending.length}
          </span>
        </button>
      </div>

      {tab === "ungraded" ? (
        <section
          role="tabpanel"
          id="panel-ungraded"
          aria-labelledby="tab-ungraded"
          className="flex flex-col gap-5"
        >
          {data.otherDaysUngradedCount > 0 && oldestUngradedDate !== null && (
            <button
              type="button"
              onClick={() => changeDate(oldestUngradedDate)}
              className="text-ai min-h-11 self-start px-3 font-bold underline"
            >
              ほかの日に未採点 {data.otherDaysUngradedCount}件 →
              一番古い日へ
            </button>
          )}

          {ungradedGroups.length === 0 ? (
            <p className="bg-yamabuki text-sumi rounded px-3 py-2 font-bold">
              未採点の提出物はありません
            </p>
          ) : (
            ungradedGroups.map((group) => (
              <div key={group.typeId} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <p className="font-bold">{group.typeName}</p>
                  <span className="font-num text-sm">あと{group.items.length}件</span>
                </div>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <GradingRow
                      key={item.submission.id}
                      item={item}
                      onGrade={grade}
                      onWithdraw={requestWithdraw}
                      menuOpen={openMenuId === item.submission.id}
                      onToggleMenu={toggleMenu}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      ) : (
        <section
          role="tabpanel"
          id="panel-resubmit"
          aria-labelledby="tab-resubmit"
          className="flex flex-col gap-5"
        >
          {resubmitGroups.length === 0 ? (
            <p>再提出待ちの生徒はいません</p>
          ) : (
            resubmitGroups.map((group) => (
              <div key={group.typeId} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <p className="font-bold">{group.typeName}</p>
                  <span className="font-num text-sm">{group.items.length}人</span>
                </div>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <GradingRow
                      key={item.submission.id}
                      item={item}
                      onGrade={grade}
                      onClear={clear}
                      menuOpen={false}
                      onToggleMenu={toggleMenu}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}

      {/* pendingWithdraw の ConfirmDialog は現行のまま */}
    </main>
  );
}
```

`changeDate` に `setOpenMenuId(null);` を足す(日付を送ったら開いていたメニューを閉じる)。

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/screens/Grading.test.tsx`
Expected: PASS

- [ ] **Step 5: 型チェックと全体テスト**

Run: `npx tsc --noEmit && npm run test:run`
Expected: すべてPASS

---

### Task 8: 確認手順の追記と機械的な検査

**Files:**
- Modify: `docs/手元での確認手順.md`(末尾に追記)
- Modify: `docs/superpowers/specs/2026-09-12-teacher-screens-redesign-design.md`(採点の帯の文言を実装に合わせて「未採点の提出物はありません」に直す)

- [ ] **Step 1: 確認手順を追記する**

`docs/手元での確認手順.md` の末尾に追加する(バッククォートを含むので、シェルの二重引用符の中で書かず、クォート付きheredocかエディタで追記する)。

```markdown

---

# 先生画面の見直し(提出チェック表・採点タブ・山吹)の確認

## 42. 山吹の見え方(最初に)

- [ ] 朝の教室の明るさで、山吹の面(進捗バー、合格ボタン、帯)の上の墨の文字が読める
- [ ] 山吹が朱(花丸)と混ざって見えない。花丸は線、山吹は面
- [ ] 山吹の文字(画用紙の上に山吹の字)がどこにも無い

## 43. 提出チェック表(`/unsubmitted`)

- [ ] 縦に在籍生徒(出席番号、設定ONなら氏名)、横にその日の提出物が並ぶ
- [ ] 提出済みは淡い山吹の地に✓、未提出は枠だけ、欠席は斜線に「欠」
- [ ] 列見出しに「28/34」の人数と、締切前は「あと◯分」、過ぎれば「確定」
- [ ] 上部に提出物ごとの進捗バー。全員提出したら数字が「全員」になり、「◯◯ 全員提出」の帯が出る
- [ ] 提出物が5つ以上の日に、表だけが横に動き、生徒の列は左に残る。ページ全体は横に動かない
- [ ] 375px幅で、提出物が4つまでなら横スクロールが出ない
- [ ] 未提出のセルをタップ→欠席の確認、欠席のセルをタップ→取り消しの確認。提出済みのセルは押しても何も起きない
- [ ] 出席番号が腕を伸ばした距離から読める
- [ ] 「直近2週間で未提出が多い生徒」は表の下に残っている

## 44. 採点タブ(`/grading`)

- [ ] 上部に「未採点 12」「再提出待ち 3」のように件数付きのタブが並び、選択中は藍の塗り
- [ ] 提出物ごとの見出しに「あと◯件」(未採点)、「◯人」(再提出待ち)
- [ ] 行は「出席番号(大きく) 氏名(設定ON時) ・遅れて提出」+「合格(山吹)」「再提出(藍の輪郭)」「⋯」
- [ ] 「⋯」を押すと行の下に「提出を取り消す」が出る。別の行の「⋯」を押すと前の行は閉じる
- [ ] 再提出待ちタブの行には「⋯」が無く、「合格」「未採点に戻す」だけ。日付が行に出る
- [ ] 未採点が0件のとき、山吹の帯で「未採点の提出物はありません」と出る
- [ ] 日付を送ってもタブは変わらない。未採点の件数だけが日付で変わる
```

- [ ] **Step 2: 機械的な検査を実行する**

```bash
cd "/Users/yutokatsuta/宿題管理システム"
echo "--- 朱 ---"; grep -rln "shu" src --include=*.tsx | sort        # Hanamaru.tsx と ConfirmDialog.tsx だけ
echo "--- 山吹の文字色 ---"; grep -rn "text-yamabuki" src || echo none  # none
echo "--- 素の色 ---"; grep -rnE "\b(bg|text|border)-(red|blue|green|yellow|gray|white|black)-[0-9]+" src || echo none
echo "--- any ---"; grep -rnE ": any\b" src || echo none
echo "--- タップ領域 ---"; grep -n "<button" src/components/CheckTable.tsx src/screens/Grading.tsx | wc -l
```

`CheckTable.tsx` と `Grading.tsx` の全 `<button>` に `min-h-11` か `size-11` があることを目視で確認する。

- [ ] **Step 3: 設計書の文言を合わせる**

設計書の「未採点タブが0件なら「未採点はありません」を山吹の帯で出す」を「未採点の提出物はありません」に直す(既存テストの文言を保ったため)。

- [ ] **Step 4: 全体テストとビルド**

Run: `npm run test:run && npm run build`
Expected: すべてPASS、ビルド成功

- [ ] **Step 5: 区切りの報告**

変更ファイル・テスト件数・機械的な検査の結果をまとめ、コミットとデプロイをユーザーに確認する(どちらも指示があるまで行わない)。

---

## 自己レビュー(計画の作成時に実施済み)

- 設計書の各要求と対応するタスク: 山吹トークン→Task 1 / 進捗バー→Task 2 / 読み取りモデル→Task 3 / 表と幅の式→Task 4 / 画面の置き換え・帯・氏名設定→Task 5 / 旧関数の削除→Task 6 / タブ・件数・⋯メニュー・合格の色・0件の帯→Task 7 / 確認手順と検査→Task 8
- 型と名前の一貫性: `DailyRoster.columns/rows/activeCount`、`CellState`、`onCellTap(student, type, state)`、`minutesUntil(deadline, now)`、`GradingRow` の `menuOpen/onToggleMenu` を全タスクで同じ名前で使っている
- 設計書との差: 採点の0件の帯の文言を「未採点の提出物はありません」に揃える(Task 8 Step 3 で設計書側を直す)
