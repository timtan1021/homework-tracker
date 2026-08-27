# 日付指定の提出物（カレンダー登録） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提出物マスタに「日付指定」の登録経路を追加する。前日までに週単位のカレンダー画面で宿題名を登録し、その日だけ提出日として扱われる。

**Architecture:** 新しいIndexedDBストアは作らない。既存の `SubmissionType` に任意フィールド `date?: string` を追加するだけで、既存の曜日繰り返し用コード（フォーム・一覧・並べ替え・CRUD）は無変更のまま動き続ける。「今日が提出日か」の判定を1つの共通関数 `isDueOn` にまとめ、3箇所の重複判定（Scan画面・未提出者一覧×2）をこれに置き換える。日付指定専用の登録・更新・削除は、既存の `addSubmissionType` 系とは別の新しいモジュールで行う（名前の重複禁止など、曜日繰り返し用の検証ルールをそのまま適用すると日付指定の実運用と矛盾するため）。

**Tech Stack:** React 19, TypeScript strict, idb (IndexedDB), Vitest + Testing Library, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-date-submissions-design.md`

## Global Constraints

- ネットワークアクセスを書かない。`fetch`、CDN、外部URLは禁止
- 配色は5トークンのみ（`gayoshi` / `sumi` / `ai` / `kogan` / `shu`）。Tailwind素のカラーを使わない。朱（`shu`）は花丸と完全に元へ戻せない操作の確認ダイアログだけに使う。日付指定項目の削除は訂正操作なので `ConfirmDialog` は `tone="normal"`（既定値）を使う
- TypeScript `strict`。`any` を使わない。`noUnusedLocals: true` — バインドしたが参照しない変数、使わなくなったimportはビルドを落とす
- タップ領域は44px四方以上
- `vi.useFakeTimers` は使わない。日付に依存するテストは実際の今日から相対的に組み立てる（`Scan.test.tsx` の既存コメント: 「時計は偽装しない。Date.now() を凍結すると Testing Library の waitFor が経過時間を測れなくなり、待ちが壊れる」）
- 375px幅で崩れない
- DB_VERSIONは上げない。`schema.ts` の `upgrade()` に触れない（既存レコードは全て曜日繰り返しであり、`date` フィールドが無いことがそのまま「曜日繰り返し」を意味するため、移行は不要）

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/db/schema.ts` | `SubmissionType` に `date?: string` を追加（Task 1） |
| `src/db/submissionTypes.ts` | `isDueOn` ヘルパーを追加。`moveSubmissionType` の兄弟探索から日付指定項目を除外（Task 1） |
| `src/db/dateSubmissions.ts` | 日付指定専用のCRUD（新規、Task 2） |
| `src/db/settings.ts` | 共通締切時刻の取得・保存（Task 3） |
| `src/lib/date.ts` | `dateFromKey`・`startOfWeek`・`weekDates` を追加（Task 3） |
| `src/screens/Scan.tsx` | `isDueOn` を使うよう変更（Task 4） |
| `src/db/nonSubmitters.ts` | `isDueOn` を使うよう変更（Task 4） |
| `src/screens/SubmissionList.tsx` | 日付指定項目を一覧から除外（Task 4） |
| `src/hooks/useDateSubmissionsInWeek.ts` | 週内の日付指定項目を取得するフック（新規、Task 5） |
| `src/screens/Calendar.tsx` | カレンダー画面（新規、Task 5） |
| `src/App.tsx` | `/calendar` ルート追加（Task 5） |
| `src/screens/Roster.tsx` | カレンダー画面への導線追加（Task 5） |
| `src/hooks/useDefaultDeadline.ts` | 共通締切時刻を扱うフック（新規、Task 6） |
| `src/screens/Settings.tsx` | 共通締切時刻の入力欄を追加（Task 6） |

---

### Task 1: `SubmissionType` に `date` を追加し、`isDueOn` ヘルパーを実装する

**Files:**
- Modify: `src/db/schema.ts`（`SubmissionType` 型）
- Modify: `src/db/submissionTypes.ts`（`isDueOn` 追加、`moveSubmissionType` の兄弟探索フィルタ変更）
- Test: `src/db/submissionTypes.test.ts`

**Interfaces:**
- Produces: `SubmissionType.date?: string`、`isDueOn(type: SubmissionType, dateKey: string): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`src/db/submissionTypes.test.ts` の先頭付近、既存の `./submissionTypes` からのimportに `isDueOn` を加える:
```ts
import {
  addSubmissionType,
  deleteSubmissionType,
  endSubmissionType,
  getSubmissionType,
  isDueOn,
  listSubmissionTypes,
  moveSubmissionType,
  normalizeName,
  restoreSubmissionType,
  updateSubmissionType,
} from "./submissionTypes";
```
`getDb` も `./schema` から追加でimportする（`moveSubmissionType` の新しいテストで直接書き込むため）:
```ts
import { getDb, type SubmissionType } from "./schema";
```

ファイル末尾に追加する:
```ts

describe("isDueOn", () => {
  it("曜日繰り返しは対象の曜日にだけtrueを返す", () => {
    const type: SubmissionType = {
      id: "t1",
      cohortId: "c1",
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [1],
      status: "active",
      order: 1,
      createdAt: Date.now(),
    };

    expect(isDueOn(type, "2026-08-24")).toBe(true); // 月曜
    expect(isDueOn(type, "2026-08-25")).toBe(false); // 火曜
  });

  it("日付指定はその日付にだけtrueを返す", () => {
    const type: SubmissionType = {
      id: "t2",
      cohortId: "c1",
      name: "計算プリント",
      deadline: "08:15",
      weekdays: [],
      date: "2026-09-01",
      status: "active",
      order: 0,
      createdAt: Date.now(),
    };

    expect(isDueOn(type, "2026-09-01")).toBe(true);
    expect(isDueOn(type, "2026-09-02")).toBe(false);
  });

  it("日付指定は曜日が一致していても対象日以外はfalse", () => {
    // 2026-09-08は2026-09-01と同じ火曜日
    const type: SubmissionType = {
      id: "t3",
      cohortId: "c1",
      name: "計算プリント",
      deadline: "08:15",
      weekdays: [],
      date: "2026-09-01",
      status: "active",
      order: 0,
      createdAt: Date.now(),
    };

    expect(isDueOn(type, "2026-09-08")).toBe(false);
  });
});
```

既存の `describe("moveSubmissionType", ...)` ブロックの末尾に追加する（ブロック内の既存 `beforeEach` の後、最後の `it` の後）:
```ts

  it("日付指定の項目は並べ替えの対象に含めない", async () => {
    const a = await drill({ name: "A" });
    const b = await drill({ name: "B" });

    const db = await getDb();
    await db.put("submissionTypes", {
      id: "date-item-1",
      cohortId,
      name: "日付指定の宿題",
      deadline: "08:15",
      weekdays: [],
      date: "2026-09-01",
      status: "active",
      order: 0,
      createdAt: Date.now(),
    });

    await moveSubmissionType(b.id, "up");

    const updatedA = await getSubmissionType(a.id);
    const updatedB = await getSubmissionType(b.id);
    expect(updatedB?.order).toBe(a.order);
    expect(updatedA?.order).toBe(b.order);
  });
```

（`drill` ヘルパーと `cohortId` はこの `describe` ブロックの既存の `beforeEach` で用意されているものをそのまま使う。)

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/db/submissionTypes.test.ts`
Expected: FAIL — `isDueOn` が存在しないためimportエラーになる

- [ ] **Step 3: `SubmissionType` に `date` を追加する**

`src/db/schema.ts` の `SubmissionType` 型定義を次で置き換える:
```ts
export type SubmissionType = {
  id: string;
  cohortId: string;
  /** 提出物名。先生が入力したそのままを保持する（比較時のみ正規化する）。 */
  name: string;
  /** "HH:mm" 24時間表記。例: "08:15"。Dateだと日付が付いて「毎日この時刻」を表せない。 */
  deadline: string;
  /** 0=日曜 〜 6=土曜。Date.getDay() と同じ番号。昇順・重複なしで保存する。日付指定の場合は使わない([])。 */
  weekdays: number[];
  /** 日付指定の場合の対象日("YYYY-MM-DD")。曜日繰り返しの場合は無い。 */
  date?: string;
  status: SubmissionStatus;
  /** 表示順。小さいほど上。日付指定の場合は使わない(並べ替えUIに出ないため)。 */
  order: number;
  createdAt: number;
};
```

- [ ] **Step 4: `isDueOn` を実装し、`moveSubmissionType` を変更する**

`src/db/submissionTypes.ts` の先頭のimportに `weekdayOfDateKey` を追加する:
```ts
import type { IDBPObjectStore } from "idb";
import { weekdayOfDateKey } from "../lib/date";
import { newId } from "../lib/id";
import { ValidationError } from "./errors";
import { getDb, type HomeworkDB, type SubmissionType } from "./schema";
```

ファイル末尾（`moveSubmissionType` の後）に追加する:
```ts

/** 対象日にこの提出物が提出日かどうかを判定する。 */
export function isDueOn(type: SubmissionType, dateKey: string): boolean {
  if (type.date !== undefined) {
    return type.date === dateKey;
  }
  return type.weekdays.includes(weekdayOfDateKey(dateKey));
}
```

`moveSubmissionType` 内の兄弟探索の行を変更する。現在:
```ts
  const siblings = (await tx.store.index("by-cohort").getAll(target.cohortId))
    .filter((type) => type.status === "active")
    .sort((a, b) => a.order - b.order);
```
これを次に変更する:
```ts
  const siblings = (await tx.store.index("by-cohort").getAll(target.cohortId))
    .filter((type) => type.status === "active" && type.date === undefined)
    .sort((a, b) => a.order - b.order);
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `npx vitest run src/db/submissionTypes.test.ts`
Expected: PASS（全件）

- [ ] **Step 6: コミット**

```bash
git add src/db/schema.ts src/db/submissionTypes.ts src/db/submissionTypes.test.ts
git commit -m "$(cat <<'EOF'
feat: SubmissionTypeに日付指定用のdateフィールドとisDueOnを追加

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 日付指定専用のCRUD（`dateSubmissions.ts`）を実装する

**Files:**
- Create: `src/db/dateSubmissions.ts`
- Test: `src/db/dateSubmissions.test.ts`

**Interfaces:**
- Consumes: `SubmissionType`（Task 1）
- Produces: `addDateSubmission`、`updateDateSubmissionName`、`deleteDateSubmission`、`listDateSubmissionsInWeek`

- [ ] **Step 1: 失敗するテストを書く**

`src/db/dateSubmissions.test.ts` を新規作成する:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import {
  addDateSubmission,
  deleteDateSubmission,
  listDateSubmissionsInWeek,
  updateDateSubmissionName,
} from "./dateSubmissions";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

describe("addDateSubmission", () => {
  it("日付指定の提出物を登録する", async () => {
    const type = await addDateSubmission({
      cohortId,
      name: "計算プリントp23",
      date: "2026-09-01",
      deadline: "08:15",
    });

    expect(type.name).toBe("計算プリントp23");
    expect(type.date).toBe("2026-09-01");
    expect(type.weekdays).toEqual([]);
    expect(type.status).toBe("active");
  });

  it("名前が空なら拒否する", async () => {
    await expect(
      addDateSubmission({
        cohortId,
        name: "  ",
        date: "2026-09-01",
        deadline: "08:15",
      }),
    ).rejects.toThrow("宿題の名前を入力してください");
  });

  it("日付の形式が不正なら拒否する", async () => {
    await expect(
      addDateSubmission({
        cohortId,
        name: "テスト",
        date: "2026/09/01",
        deadline: "08:15",
      }),
    ).rejects.toThrow("日付を選んでください");
  });

  it("同じ名前を複数の日付に登録できる", async () => {
    await addDateSubmission({
      cohortId,
      name: "計算プリント",
      date: "2026-09-01",
      deadline: "08:15",
    });
    const second = await addDateSubmission({
      cohortId,
      name: "計算プリント",
      date: "2026-09-02",
      deadline: "08:15",
    });

    expect(second.name).toBe("計算プリント");
  });
});

describe("updateDateSubmissionName", () => {
  it("名前を更新する", async () => {
    const type = await addDateSubmission({
      cohortId,
      name: "元の名前",
      date: "2026-09-01",
      deadline: "08:15",
    });

    await updateDateSubmissionName(type.id, "新しい名前");

    const list = await listDateSubmissionsInWeek(cohortId, ["2026-09-01"]);
    expect(list[0].name).toBe("新しい名前");
  });

  it("空文字にすると拒否する", async () => {
    const type = await addDateSubmission({
      cohortId,
      name: "元の名前",
      date: "2026-09-01",
      deadline: "08:15",
    });

    await expect(updateDateSubmissionName(type.id, "  ")).rejects.toThrow(
      "宿題の名前を入力してください",
    );
  });

  it("存在しないIDなら拒否する", async () => {
    await expect(
      updateDateSubmissionName("missing", "新しい名前"),
    ).rejects.toThrow("この宿題は見つかりません");
  });
});

describe("deleteDateSubmission", () => {
  it("完全に削除する", async () => {
    const type = await addDateSubmission({
      cohortId,
      name: "テスト",
      date: "2026-09-01",
      deadline: "08:15",
    });

    await deleteDateSubmission(type.id);

    expect(await listDateSubmissionsInWeek(cohortId, ["2026-09-01"])).toEqual(
      [],
    );
  });
});

describe("listDateSubmissionsInWeek", () => {
  it("対象週の日付だけを日付順で返す", async () => {
    await addDateSubmission({
      cohortId,
      name: "9/2の宿題",
      date: "2026-09-02",
      deadline: "08:15",
    });
    await addDateSubmission({
      cohortId,
      name: "9/1の宿題",
      date: "2026-09-01",
      deadline: "08:15",
    });
    await addDateSubmission({
      cohortId,
      name: "対象外",
      date: "2026-09-08",
      deadline: "08:15",
    });

    const list = await listDateSubmissionsInWeek(cohortId, [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
    ]);

    expect(list.map((t) => t.name)).toEqual(["9/1の宿題", "9/2の宿題"]);
  });

  it("別のクラスの項目は含まない", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addDateSubmission({
      cohortId: other.id,
      name: "他クラスの宿題",
      date: "2026-09-01",
      deadline: "08:15",
    });

    const list = await listDateSubmissionsInWeek(cohortId, ["2026-09-01"]);
    expect(list).toEqual([]);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/db/dateSubmissions.test.ts`
Expected: FAIL — `src/db/dateSubmissions.ts` が存在しない

- [ ] **Step 3: `dateSubmissions.ts` を実装する**

`src/db/dateSubmissions.ts` を新規作成する:
```ts
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

export async function addDateSubmission(input: {
  cohortId: string;
  name: string;
  date: string;
  deadline: string;
}): Promise<SubmissionType> {
  assertValidName(input.name);
  assertValidDate(input.date);

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
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run src/db/dateSubmissions.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/db/dateSubmissions.ts src/db/dateSubmissions.test.ts
git commit -m "$(cat <<'EOF'
feat: 日付指定の提出物専用のCRUD(dateSubmissions.ts)を追加

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 共通締切時刻の設定と、週の日付計算ヘルパーを追加する

**Files:**
- Modify: `src/db/settings.ts`
- Test: `src/db/settings.test.ts`
- Modify: `src/lib/date.ts`
- Test: `src/lib/date.test.ts`

**Interfaces:**
- Produces: `getDefaultDeadline(): Promise<string>`、`setDefaultDeadline(deadline: string): Promise<void>`、`dateFromKey(dateKey: string): Date`、`startOfWeek(dateKey: string): string`、`weekDates(startDate: string): string[]`

- [ ] **Step 1: 失敗するテストを書く（settings）**

`src/db/settings.test.ts` の1行目のimportに `getDefaultDeadline, setDefaultDeadline` を追加する:
```ts
import { describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { getDefaultDeadline, getSetting, setDefaultDeadline, setSetting } from "./settings";
```

ファイル末尾に追加する:
```ts

describe("getDefaultDeadline", () => {
  it("未設定なら08:15を返す", async () => {
    expect(await getDefaultDeadline()).toBe("08:15");
  });
});

describe("setDefaultDeadline", () => {
  it("保存した値を読み戻せる", async () => {
    await setDefaultDeadline("08:30");
    expect(await getDefaultDeadline()).toBe("08:30");
  });

  it("boolean設定とは独立している", async () => {
    await setDefaultDeadline("08:30");
    expect(await getSetting("showStudentNames")).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗するテストを書く（date）**

`src/lib/date.test.ts` の1行目のimportに `dateFromKey, startOfWeek, weekDates` を追加する（既存のアルファベット順のdestructureに合わせて挿入する）。

ファイル末尾に追加する:
```ts

describe("dateFromKey", () => {
  it("YYYY-MM-DDをローカル時刻のDateに戻す", () => {
    const date = dateFromKey("2026-08-24");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7); // 0始まり
    expect(date.getDate()).toBe(24);
  });
});

describe("startOfWeek", () => {
  it("週の日曜日を返す(2026-08-24は月曜)", () => {
    expect(startOfWeek("2026-08-24")).toBe("2026-08-23");
  });

  it("日曜日自身を渡すと同じ日を返す", () => {
    expect(startOfWeek("2026-08-23")).toBe("2026-08-23");
  });

  it("月をまたぐ週も正しく計算する", () => {
    // 2026-09-01は火曜
    expect(startOfWeek("2026-09-01")).toBe("2026-08-30");
  });
});

describe("weekDates", () => {
  it("startDateから7日分を古い順に返す", () => {
    expect(weekDates("2026-08-23")).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });

  it("月をまたぐ週も正しく返す", () => {
    expect(weekDates("2026-08-30")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `npx vitest run src/db/settings.test.ts src/lib/date.test.ts`
Expected: FAIL — `getDefaultDeadline`/`setDefaultDeadline`/`dateFromKey`/`startOfWeek`/`weekDates` が存在しない

- [ ] **Step 4: `settings.ts` に実装を追加する**

`src/db/settings.ts` の末尾（`setSetting` の後）に追加する。既存の `getSetting`/`setSetting`（boolean専用）には触れない:
```ts

const DEFAULT_DEADLINE_KEY = "dateSubmissionDefaultDeadline";
const DEFAULT_DEADLINE_FALLBACK = "08:15";

export async function getDefaultDeadline(): Promise<string> {
  const db = await getDb();
  const row = await db.get("settings", DEFAULT_DEADLINE_KEY);
  return typeof row?.value === "string" ? row.value : DEFAULT_DEADLINE_FALLBACK;
}

export async function setDefaultDeadline(deadline: string): Promise<void> {
  const db = await getDb();
  await db.put("settings", { key: DEFAULT_DEADLINE_KEY, value: deadline });
}
```

- [ ] **Step 5: `date.ts` に実装を追加する**

`src/lib/date.ts` の末尾に追加する:
```ts

/** "YYYY-MM-DD" をローカル時刻の Date に戻す。 */
export function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** dateKey を含む週の日曜日を返す("YYYY-MM-DD")。 */
export function startOfWeek(dateKey: string): string {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() - date.getDay());
  return toDateKey(date);
}

/** startDate から7日分の日付キーを、古い順に返す。 */
export function weekDates(startDate: string): string[] {
  const start = dateFromKey(startDate);
  return Array.from({ length: 7 }, (_, i) => {
    const current = new Date(start);
    current.setDate(current.getDate() + i);
    return toDateKey(current);
  });
}
```

- [ ] **Step 6: テストを実行して成功を確認する**

Run: `npx vitest run src/db/settings.test.ts src/lib/date.test.ts`
Expected: PASS（全件）

- [ ] **Step 7: コミット**

```bash
git add src/db/settings.ts src/db/settings.test.ts src/lib/date.ts src/lib/date.test.ts
git commit -m "$(cat <<'EOF'
feat: 日付指定の共通締切時刻設定と週の日付計算ヘルパーを追加

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 既存画面を `isDueOn` に統合し、日付指定項目を一覧から除外する

**Files:**
- Modify: `src/screens/Scan.tsx`
- Test: `src/screens/Scan.test.tsx`
- Modify: `src/db/nonSubmitters.ts`
- Test: `src/db/nonSubmitters.test.ts`
- Modify: `src/screens/SubmissionList.tsx`
- Test: `src/screens/SubmissionList.test.tsx`

**Interfaces:**
- Consumes: `isDueOn`（Task 1）、`addDateSubmission`（Task 2）

- [ ] **Step 1: 失敗するテストを書く（Scan）**

`src/screens/Scan.test.tsx` のimportに `addDateSubmission` を追加する:
```ts
import { addDateSubmission } from "../db/dateSubmissions";
```

モジュール冒頭の日付フィクスチャの近くに、前日の日付キーを追加する:
```ts
const YESTERDAY = new Date(TODAY);
YESTERDAY.setDate(YESTERDAY.getDate() - 1);
const YESTERDAY_KEY = toDateKey(YESTERDAY);
```
（`TODAY`・`toDateKey` は既存のimport/フィクスチャをそのまま使う。）

「今日が提出日のものだけ並べる」テストの近くに追加する:
```ts
it("日付指定の提出物は対象日にだけ並べる", async () => {
  await addDateSubmission({
    cohortId,
    name: "今日締切の日付指定",
    date: TODAY_KEY,
    deadline: "08:15",
  });
  await addDateSubmission({
    cohortId,
    name: "別の日の日付指定",
    date: YESTERDAY_KEY,
    deadline: "08:15",
  });

  renderAt("/scan");

  expect(
    await screen.findByRole("button", { name: /今日締切の日付指定/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /別の日の日付指定/ }),
  ).toBeNull();
});
```

- [ ] **Step 2: 失敗するテストを書く（nonSubmitters）**

`src/db/nonSubmitters.test.ts` のimportに `addDateSubmission` を追加する:
```ts
import { addDateSubmission } from "./dateSubmissions";
```

`describe("listTodayNonSubmitters", ...)` の末尾に追加する:
```ts

  it("日付指定の提出物は対象日にだけ未提出者一覧に出る", async () => {
    await addDateSubmission({
      cohortId,
      name: "計算プリント",
      date: DATE,
      deadline: "08:15",
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].type.name).toBe("計算プリント");
  });

  it("日付指定の提出物は対象日以外には出ない", async () => {
    await addDateSubmission({
      cohortId,
      name: "計算プリント",
      date: "2026-08-25",
      deadline: "08:15",
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toEqual([]);
  });
```

`describe("countRecentNonSubmissions", ...)` の末尾に追加する:
```ts

  it("日付指定の提出物は対象日だけを未提出カウントに含める", async () => {
    await addDateSubmission({
      cohortId,
      name: "日付指定の宿題",
      date: today,
      deadline: "00:00",
    });
    const student = await addStudent({ cohortId, attendanceNumber: 1 });

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toHaveLength(1);
    expect(result[0].student.id).toBe(student.id);
    expect(result[0].count).toBe(1);
  });
```

（`today` はこの `describe` ブロック内の既存の `const today = toDateKey(new Date());` を使う。)

- [ ] **Step 3: 失敗するテストを書く（SubmissionList）**

`src/screens/SubmissionList.test.tsx` のimportに `addDateSubmission` を追加する:
```ts
import { addDateSubmission } from "../db/dateSubmissions";
```

ファイル末尾（既存の `describe`/`it` ブロックの外、または適切な既存 `describe` の末尾）に追加する:
```ts

it("日付指定の提出物は一覧に出さない", async () => {
  await add("毎週の宿題");
  await addDateSubmission({
    cohortId,
    name: "日付指定の宿題",
    date: "2026-09-01",
    deadline: "08:15",
  });

  renderList();

  await screen.findByText("毎週の宿題");
  expect(screen.queryByText("日付指定の宿題")).toBeNull();
});
```

（`add`・`renderList`・`cohortId` はこのファイルの既存ヘルパー/フィクスチャをそのまま使う。テストが `describe` の外にある場合、`beforeEach` で設定される `cohortId` がテストファイル全体のトップレベルスコープにあることを確認してから配置する。）

- [ ] **Step 4: テストを実行して失敗を確認する**

Run: `npx vitest run src/screens/Scan.test.tsx src/db/nonSubmitters.test.tsx src/screens/SubmissionList.test.tsx`

Expected: 3ファイルとも新規テストがFAIL — `Scan.tsx`・`nonSubmitters.ts`・`SubmissionList.tsx` がまだ日付指定を認識しないため

- [ ] **Step 5: `Scan.tsx` を変更する**

先頭のimportに `isDueOn` を追加する:
```ts
import { isDueOn } from "../db/submissionTypes";
```

次の2行（`todayTypes` の計算）を:
```ts
  const activeTypes = types.data.filter((type) => type.status === "active");
  const todayTypes = activeTypes.filter((type) =>
    type.weekdays.includes(today.getDay()),
  );
```
次に置き換える:
```ts
  const activeTypes = types.data.filter((type) => type.status === "active");
  const todayTypes = activeTypes.filter((type) => isDueOn(type, date));
```
（`date` はこのファイル冒頭で既に `const date = toDateKey(today);` として計算済みの変数。`today.getDay()` を直接使っていた箇所を `isDueOn` に委譲する。）

- [ ] **Step 6: `nonSubmitters.ts` を変更する**

先頭のimportを変更する。現在:
```ts
import {
  isPastDeadline,
  recentDateKeys,
  toDateKey,
  weekdayOfDateKey,
} from "../lib/date";
```
次に置き換える（`weekdayOfDateKey` は直接使わなくなるため外す）:
```ts
import { isPastDeadline, recentDateKeys, toDateKey } from "../lib/date";
```
既存の `import { listSubmissionTypes } from "./submissionTypes";` を次に置き換える（同じモジュールから2つのimport文にしない）:
```ts
import { isDueOn, listSubmissionTypes } from "./submissionTypes";
```

`listTodayNonSubmitters` 内の次の3行:
```ts
  const weekday = weekdayOfDateKey(date);
  const dueTypes = types.filter(
    (type) => type.status === "active" && type.weekdays.includes(weekday),
  );
```
を次に置き換える:
```ts
  const dueTypes = types.filter(
    (type) => type.status === "active" && isDueOn(type, date),
  );
```

`countRecentNonSubmissions` 内の日付ループの先頭、次の2行:
```ts
    const weekday = weekdayOfDateKey(date);

    for (const type of activeTypes) {
      if (!type.weekdays.includes(weekday)) continue;
```
を次に置き換える:
```ts
    for (const type of activeTypes) {
      if (!isDueOn(type, date)) continue;
```

- [ ] **Step 7: `SubmissionList.tsx` を変更する**

現在の行:
```ts
  const list = types.data;
```
を次に置き換える:
```ts
  const list = types.data.filter((type) => type.date === undefined);
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `npx vitest run src/screens/Scan.test.tsx src/db/nonSubmitters.test.tsx src/screens/SubmissionList.test.tsx`
Expected: PASS（全件）

- [ ] **Step 9: コミット**

```bash
git add src/screens/Scan.tsx src/screens/Scan.test.tsx src/db/nonSubmitters.ts src/db/nonSubmitters.test.ts src/screens/SubmissionList.tsx src/screens/SubmissionList.test.tsx
git commit -m "$(cat <<'EOF'
feat: Scan画面・未提出者一覧・提出物一覧を日付指定項目に対応させる

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: カレンダー画面を実装する

**Files:**
- Create: `src/hooks/useDateSubmissionsInWeek.ts`
- Create: `src/screens/Calendar.tsx`
- Test: `src/screens/Calendar.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/screens/Roster.tsx`
- Test: `src/screens/Roster.test.tsx`

**Interfaces:**
- Consumes: `listDateSubmissionsInWeek`・`addDateSubmission`・`updateDateSubmissionName`・`deleteDateSubmission`（Task 2）、`getDefaultDeadline`（Task 3）、`dateFromKey`・`startOfWeek`・`weekDates`（Task 3）、`ConfirmDialog`・`CohortGate`/`useActiveCohort`・`FullScreenMessage`（既存）

- [ ] **Step 1: `useDateSubmissionsInWeek` フックを実装する**

`src/hooks/useDateSubmissionsInWeek.ts` を新規作成する:
```ts
import type { SubmissionType } from "../db/schema";
import { listDateSubmissionsInWeek } from "../db/dateSubmissions";
import { weekDates } from "../lib/date";
import { useAsync, type AsyncState } from "./useAsync";

export function useDateSubmissionsInWeek(
  cohortId: string,
  weekStart: string,
): AsyncState<SubmissionType[]> & { reload: () => void } {
  return useAsync(
    () => listDateSubmissionsInWeek(cohortId, weekDates(weekStart)),
    `date-submissions:${cohortId}:${weekStart}`,
  );
}
```

このフックにはテストを別に書かない（`useAsync` の挙動は既存の `useTodayNonSubmitters.ts` 等と同じパターンで既に検証済み。カレンダー画面の結合テストで間接的に確認する）。

- [ ] **Step 2: 失敗するテストを書く（Calendar画面）**

`src/screens/Calendar.test.tsx` を新規作成する:
```ts
import { useFreshDb } from "../test/db";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { addDateSubmission, listDateSubmissionsInWeek } from "../db/dateSubmissions";
import { setDefaultDeadline } from "../db/settings";
import { startOfWeek, toDateKey } from "../lib/date";

useFreshDb();

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

describe("カレンダー画面", () => {
  it("今週の日付が7日ぶん並ぶ", async () => {
    renderAt("/calendar");

    const weekStart = startOfWeek(toDateKey(new Date()));
    const [year, month, day] = weekStart.split("-").map(Number);
    const start = new Date(year, month - 1, day);

    for (let i = 0; i < 7; i++) {
      const current = new Date(start);
      current.setDate(current.getDate() + i);
      const label = `${current.getMonth() + 1}月${current.getDate()}日`;
      expect(await screen.findByText(new RegExp(label))).toBeInTheDocument();
    }
  });

  it("未登録の日をタップして宿題名を登録できる", async () => {
    const user = userEvent.setup();
    renderAt("/calendar");

    const buttons = await screen.findAllByRole("button", {
      name: "タップして登録",
    });
    await user.click(buttons[0]);

    const input = await screen.findByRole("textbox");
    await user.type(input, "計算プリントp23");
    fireEvent.blur(input);

    expect(await screen.findByText("計算プリントp23")).toBeInTheDocument();
  });

  it("空欄のまま確定しようとするとエラーを出し登録しない", async () => {
    const user = userEvent.setup();
    renderAt("/calendar");

    const buttons = await screen.findAllByRole("button", {
      name: "タップして登録",
    });
    await user.click(buttons[0]);

    const input = await screen.findByRole("textbox");
    fireEvent.blur(input); // 何も入力せずblur

    expect(
      await screen.findByText("宿題の名前を入力してください"),
    ).toBeInTheDocument();
  });

  it("登録済みの項目をタップして名前を編集できる", async () => {
    const user = userEvent.setup();
    const weekStart = startOfWeek(toDateKey(new Date()));
    await addDateSubmission({
      cohortId,
      name: "元の名前",
      date: weekStart,
      deadline: "08:15",
    });

    renderAt("/calendar");

    await user.click(await screen.findByText("元の名前"));
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "新しい名前" } });
    fireEvent.blur(input);

    expect(await screen.findByText("新しい名前")).toBeInTheDocument();
  });

  it("削除の確認ダイアログを経て項目を削除できる", async () => {
    const user = userEvent.setup();
    const weekStart = startOfWeek(toDateKey(new Date()));
    await addDateSubmission({
      cohortId,
      name: "削除する宿題",
      date: weekStart,
      deadline: "08:15",
    });

    renderAt("/calendar");

    await screen.findByText("削除する宿題");
    await user.click(await screen.findByRole("button", { name: "削除" }));
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    expect(screen.queryByText("削除する宿題")).toBeNull();
  });

  it("次週・前週で表示が切り替わる", async () => {
    const user = userEvent.setup();
    const weekStart = startOfWeek(toDateKey(new Date()));
    const [year, month, day] = weekStart.split("-").map(Number);
    const nextWeekStartDate = new Date(year, month - 1, day + 7);
    const nextWeekKey = toDateKey(nextWeekStartDate);

    await addDateSubmission({
      cohortId,
      name: "来週の宿題",
      date: nextWeekKey,
      deadline: "08:15",
    });

    renderAt("/calendar");

    expect(screen.queryByText("来週の宿題")).toBeNull();

    await user.click(await screen.findByRole("button", { name: "次週 →" }));

    expect(await screen.findByText("来週の宿題")).toBeInTheDocument();
  });

  it("設定画面の共通締切時刻を新規登録に使う", async () => {
    const user = userEvent.setup();
    await setDefaultDeadline("09:00");
    const weekStart = startOfWeek(toDateKey(new Date()));

    renderAt("/calendar");

    const buttons = await screen.findAllByRole("button", {
      name: "タップして登録",
    });
    await user.click(buttons[0]);
    const input = await screen.findByRole("textbox");
    await user.type(input, "登録テスト宿題");
    fireEvent.blur(input);

    await screen.findByText("登録テスト宿題");
    const list = await listDateSubmissionsInWeek(cohortId, [weekStart]);
    expect(list[0].deadline).toBe("09:00");
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `npx vitest run src/screens/Calendar.test.tsx`
Expected: FAIL — `src/screens/Calendar.tsx` が存在しない、`/calendar` ルートも無い

- [ ] **Step 4: `Calendar.tsx` を実装する**

`src/screens/Calendar.tsx` を新規作成する:
```tsx
import { useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullScreenMessage } from "../components/FullScreenMessage";
import {
  addDateSubmission,
  deleteDateSubmission,
  updateDateSubmissionName,
} from "../db/dateSubmissions";
import { getDefaultDeadline } from "../db/settings";
import { useDateSubmissionsInWeek } from "../hooks/useDateSubmissionsInWeek";
import {
  dateFromKey,
  formatDateHeading,
  startOfWeek,
  toDateKey,
  weekDates,
} from "../lib/date";

type Editing = { date: string; id: string | null; value: string };
type Pending = { id: string; name: string };

function CalendarBody() {
  const cohort = useActiveCohort();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(toDateKey(new Date())),
  );
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const types = useDateSubmissionsInWeek(cohort.id, weekStart);

  if (types.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (types.status === "error") {
    return <FullScreenMessage tone="error">{types.message}</FullScreenMessage>;
  }

  const dates = weekDates(weekStart);
  const byDate = new Map<string, typeof types.data>();
  for (const date of dates) {
    byDate.set(
      date,
      types.data.filter((type) => type.date === date),
    );
  }

  function shiftWeek(days: number): void {
    const next = new Date(dateFromKey(weekStart));
    next.setDate(next.getDate() + days);
    setWeekStart(toDateKey(next));
  }

  function startEditing(date: string, id: string | null, value: string): void {
    setEditError(null);
    setEditing({ date, id, value });
  }

  function cancelEditing(): void {
    setEditing(null);
    setEditError(null);
  }

  async function commitEditing(): Promise<void> {
    if (editing === null) {
      return;
    }
    if (editing.value.trim() === "") {
      setEditError("宿題の名前を入力してください");
      return;
    }

    const current = editing;
    setEditing(null);
    setEditError(null);

    if (current.id === null) {
      const deadline = await getDefaultDeadline();
      await addDateSubmission({
        cohortId: cohort.id,
        name: current.value,
        date: current.date,
        deadline,
      });
    } else {
      await updateDateSubmissionName(current.id, current.value);
    }
    types.reload();
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      cancelEditing();
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <h1 className="font-display text-ai text-2xl">
          宿題をカレンダーで登録
        </h1>
        <Link to="/roster" className="text-ai shrink-0 p-2 font-bold underline">
          名簿へ
        </Link>
      </header>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => shiftWeek(-7)}
          className="border-ai text-ai min-h-11 rounded border-2 px-4 font-bold"
        >
          ← 前週
        </button>
        <span className="font-bold">
          {formatDateHeading(dateFromKey(dates[0]))} 〜{" "}
          {formatDateHeading(dateFromKey(dates[6]))}
        </span>
        <button
          type="button"
          onClick={() => shiftWeek(7)}
          className="border-ai text-ai min-h-11 rounded border-2 px-4 font-bold"
        >
          次週 →
        </button>
      </div>

      <ul className="flex flex-col gap-4">
        {dates.map((date) => {
          const items = byDate.get(date) ?? [];
          const isAddingHere =
            editing !== null && editing.date === date && editing.id === null;

          return (
            <li key={date} className="border-kogan border-b pb-3">
              <p className="font-bold">{formatDateHeading(dateFromKey(date))}</p>

              <div className="mt-2 flex flex-col gap-2">
                {items.map((type) => {
                  const isEditingThis =
                    editing !== null && editing.id === type.id;

                  if (isEditingThis && editing !== null) {
                    return (
                      <div key={type.id} className="flex flex-col gap-1">
                        <input
                          type="text"
                          value={editing.value}
                          autoFocus
                          onChange={(event) =>
                            setEditing({ ...editing, value: event.target.value })
                          }
                          onBlur={() => void commitEditing()}
                          onKeyDown={handleEditKeyDown}
                          className="border-ai min-h-11 w-full rounded border-2 px-3 py-2"
                        />
                        {editError !== null && (
                          <p role="alert" className="text-sm font-bold">
                            {editError}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={type.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(date, type.id, type.name)}
                        className="border-ai min-h-11 flex-1 rounded border-2 px-3 py-2 text-left"
                      >
                        {type.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`${type.name}を削除`}
                        onClick={() =>
                          setPending({ id: type.id, name: type.name })
                        }
                        className="text-ai min-h-11 min-w-11 rounded border-2 border-ai px-3 font-bold"
                      >
                        削除
                      </button>
                    </div>
                  );
                })}

                {isAddingHere && editing !== null ? (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      value={editing.value}
                      autoFocus
                      onChange={(event) =>
                        setEditing({ ...editing, value: event.target.value })
                      }
                      onBlur={() => void commitEditing()}
                      onKeyDown={handleEditKeyDown}
                      className="border-ai min-h-11 w-full rounded border-2 px-3 py-2"
                    />
                    {editError !== null && (
                      <p role="alert" className="text-sm font-bold">
                        {editError}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditing(date, null, "")}
                    className="border-kogan text-ai min-h-11 rounded border-2 border-dashed px-3 py-2 text-left text-sm"
                  >
                    {items.length === 0 ? "タップして登録" : "＋もう1件"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pending !== null && (
        <ConfirmDialog
          title={`「${pending.name}」を削除しますか`}
          message="この宿題の登録を取り消します"
          confirmLabel="削除する"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const id = pending.id;
            setPending(null);
            void deleteDateSubmission(id).then(() => types.reload());
          }}
        />
      )}
    </main>
  );
}

export function Calendar() {
  return (
    <CohortGate>
      <CalendarBody />
    </CohortGate>
  );
}
```

- [ ] **Step 5: ルートを追加する**

`src/App.tsx` の `import` 群に追加する:
```ts
import { Calendar } from "./screens/Calendar";
```
`<Route path="/unsubmitted" element={<Unsubmitted />} />` の直後に追加する:
```tsx
<Route path="/calendar" element={<Calendar />} />
```

- [ ] **Step 6: 名簿画面にナビ導線を追加する**

`src/screens/Roster.tsx` の下部ナビ、`<Link to="/unsubmitted" ...>未提出者・集計を見る</Link>` の直後に追加する:
```tsx
<Link
  to="/calendar"
  className="border-ai text-ai rounded border-2 px-4 py-3 text-center font-bold"
>
  宿題をカレンダーで登録
</Link>
```

`src/screens/Roster.test.tsx` の `describe("下部のボタン", ...)` ブロック末尾に追加する:
```ts

  it("カレンダーへの導線がある", async () => {
    renderRoster();

    expect(
      await screen.findByRole("link", { name: "宿題をカレンダーで登録" }),
    ).toHaveAttribute("href", "/calendar");
  });
```

- [ ] **Step 7: テストを実行して成功を確認する**

Run: `npx vitest run src/screens/Calendar.test.tsx src/screens/Roster.test.tsx`
Expected: PASS（全件）

- [ ] **Step 8: コミット**

```bash
git add src/hooks/useDateSubmissionsInWeek.ts src/screens/Calendar.tsx src/screens/Calendar.test.tsx src/App.tsx src/screens/Roster.tsx src/screens/Roster.test.tsx
git commit -m "$(cat <<'EOF'
feat: 日付指定の宿題を登録するカレンダー画面を追加

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 設定画面に共通締切時刻の入力欄を追加する

**Files:**
- Create: `src/hooks/useDefaultDeadline.ts`
- Modify: `src/screens/Settings.tsx`
- Test: `src/screens/Settings.test.tsx`

**Interfaces:**
- Consumes: `getDefaultDeadline`・`setDefaultDeadline`（Task 3）
- Produces: `useDefaultDeadline(): { value: string; loading: boolean; error: string | null; update: (next: string) => Promise<void> }`

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/Settings.test.tsx` のimportに `getDefaultDeadline` を追加する（既存の `getSetting` 等のimportに合わせる）:
```ts
import { getDefaultDeadline } from "../db/settings";
```

既存のチェックボックステストの近くに追加する:
```ts
it("共通締切時刻を変更できる", async () => {
  renderAt("/settings");

  const input = await screen.findByLabelText("日付指定の宿題の共通締切時刻");
  await waitFor(() => expect(input).toBeEnabled());

  fireEvent.change(input, { target: { value: "09:00" } });

  await waitFor(async () => {
    expect(await getDefaultDeadline()).toBe("09:00");
  });
});
```
（`fireEvent` が未importなら `@testing-library/react` からのimportに追加する。CLAUDE.mdの既存方針: `clear()` + `type()` は負荷下で競合するため `fireEvent.change` を使う。）

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/screens/Settings.test.tsx`
Expected: FAIL — `getDefaultDeadline` はTask 3で実装済みだが、`Settings.tsx` に対応する入力欄がまだ無い

- [ ] **Step 3: `useDefaultDeadline` フックを実装する**

`src/hooks/useDefaultDeadline.ts` を新規作成する:
```ts
import { useCallback, useEffect, useState } from "react";
import { getDefaultDeadline, setDefaultDeadline } from "../db/settings";

const FALLBACK = "08:15";

export function useDefaultDeadline(): {
  value: string;
  loading: boolean;
  error: string | null;
  update: (next: string) => Promise<void>;
} {
  const [value, setValue] = useState<string>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getDefaultDeadline()
      .then((stored) => {
        if (!cancelled) {
          setValue(stored);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(
    async (next: string) => {
      const previous = value;
      setValue(next);
      setError(null);

      try {
        await setDefaultDeadline(next);
      } catch {
        setValue(previous);
        setError("設定を保存できませんでした。もう一度お試しください");
      }
    },
    [value],
  );

  return { value, loading, error, update };
}
```

- [ ] **Step 4: `Settings.tsx` に入力欄を追加する**

先頭のimportに追加する:
```ts
import { useDefaultDeadline } from "../hooks/useDefaultDeadline";
```

コンポーネント冒頭、`const showNames = useSetting("showStudentNames");` の直後に追加する:
```ts
  const defaultDeadline = useDefaultDeadline();
```

既存の氏名表示チェックボックスのブロック（`</div>` で閉じた直後、エラー表示 `{showNames.error !== null && ...}` の後）に、新しいセクションを追加する:
```tsx
      <section className="border-kogan mt-8 border-b pb-6">
        <h2 className="font-display text-ai text-lg">
          日付指定の宿題の共通締切時刻
        </h2>
        <p className="mt-2 text-sm">
          カレンダー画面で日付指定の宿題を登録するときに使う締切時刻です。
        </p>
        <label className="mt-3 flex flex-col gap-1">
          <span className="sr-only">日付指定の宿題の共通締切時刻</span>
          <input
            type="time"
            value={defaultDeadline.value}
            disabled={defaultDeadline.loading}
            onChange={(event) => void defaultDeadline.update(event.target.value)}
            aria-label="日付指定の宿題の共通締切時刻"
            className="border-ai font-num w-40 rounded border-2 px-3 py-2 text-2xl disabled:opacity-50"
          />
        </label>
        {defaultDeadline.error !== null && (
          <p role="alert" className="mt-3 text-sm font-bold">
            {defaultDeadline.error}
          </p>
        )}
      </section>
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `npx vitest run src/screens/Settings.test.tsx`
Expected: PASS（全件）

- [ ] **Step 6: コミット**

```bash
git add src/hooks/useDefaultDeadline.ts src/screens/Settings.tsx src/screens/Settings.test.tsx
git commit -m "$(cat <<'EOF'
feat: 設定画面に日付指定の宿題の共通締切時刻を追加

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 全体確認と制約チェック

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
grep -n "text-shu\|bg-shu\|border-shu" src/screens/Calendar.tsx src/screens/Settings.tsx || echo "朱の使用なし(OK)"
grep -nE "text-(white|black|red|blue|green|gray|slate|zinc|yellow)-[0-9]|bg-(white|black|red|blue|green|gray|slate|zinc|yellow)-[0-9]" src/screens/Calendar.tsx src/screens/Settings.tsx src/db/dateSubmissions.ts src/db/settings.ts src/db/submissionTypes.ts src/lib/date.ts || echo "Tailwind素のカラーなし(OK)"
grep -n ": any\b\|<any>\|as any" src/screens/Calendar.tsx src/hooks/useDateSubmissionsInWeek.ts src/hooks/useDefaultDeadline.ts src/db/dateSubmissions.ts || echo "anyの使用なし(OK)"
```
Expected: 3つとも「なし(OK)」が出る

- [ ] **Step 4: わざと壊してテストが落ちることを確認する（破壊試験）**

`src/db/submissionTypes.ts` の `isDueOn` 内、`type.date !== undefined` の条件を一時的に `false` に変える（常に曜日判定へ落ちるようにする）。

Run: `npx vitest run src/db/submissionTypes.test.ts`
Expected: 「日付指定はその日付にだけtrueを返す」がFAIL する（`weekdays: []` のため常にfalseになり、テストの `toBe(true)` 側が落ちる）

元に戻す（`type.date !== undefined` に戻す）。

Run: `npx vitest run src/db/submissionTypes.test.ts`
Expected: 全件PASSに戻る

- [ ] **Step 5: コミット（変更が無ければスキップ）**

Step 4の変更は最終的に元に戻しているため、通常はここでのコミットは無い。

```bash
git status
```
Expected: `nothing to commit, working tree clean`

---

## Self-Review

- **spec coverage:** データ層（3.1–3.6）→ Task 1–3、既存画面統合（3.2の3箇所・3.3）→ Task 4、画面（4.1・4.4）→ Task 5、設定画面（4.2）→ Task 6、名簿導線（4.3）→ Task 5、テスト方針（5節）→ 各タスクに破壊試験を配置しTask 7でも追加、対象外（6節）→ どのタスクでも実装していない（意図的に対象外のまま。「終了」状態・3件超の専用UI・月表示・個別締切時刻・`/submissions`への統合表示のいずれも作らない）
- **placeholder scan:** 「TBD」「後で」等の記述なし。すべてのコードブロックは実際に貼り付け可能な完全なコード
- **type consistency:** `SubmissionType.date?: string` はTask 1で定義し、Task 2 (`dateSubmissions.ts`)・Task 4 (`isDueOn` 呼び出し・`SubmissionList.tsx` のフィルタ)・Task 5 (`Calendar.tsx`) で一貫して同じ意味（曜日繰り返しの場合は `undefined`）で使われている。`isDueOn(type: SubmissionType, dateKey: string): boolean` の名前・引数順序はTask 1で定義した後、Task 4の3箇所（`Scan.tsx`・`nonSubmitters.ts`×2）で同じシグネチャのまま呼ばれている。`listDateSubmissionsInWeek(cohortId: string, weekDates: string[])` はTask 2で定義し、Task 5の `useDateSubmissionsInWeek` から同じ引数順で呼ばれている
