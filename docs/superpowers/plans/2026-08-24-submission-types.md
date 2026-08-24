# 提出物マスタ + 締切設定 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先生が「計算ドリル」「音読カード」などの提出物を登録し、それぞれに締切時刻と提出曜日を設定できるようにする。

**Architecture:** ステップ1で作った土台をそのまま使う。IndexedDBをバージョン2に上げて `submissionTypes` ストアを1つ追加し、データ層（`src/db/submissionTypes.ts`）を React 非依存の非同期関数として切り出す。画面はステップ1の生徒名簿・編集画面と同じ構造・同じ部品（`CohortGate` / `FullScreenMessage` / `ConfirmDialog` / `useAsync`）で組み、先生が2つの領域で違う操作体系を覚えずに済むようにする。

**Tech Stack:** 既存のまま。React 19 / Vite 8 / TypeScript 5.9 / Tailwind CSS 4 / react-router 8 / idb 8 / Vitest 4 + React Testing Library + fake-indexeddb

設計書: [`docs/superpowers/specs/2026-08-24-submission-types-design.md`](../specs/2026-08-24-submission-types-design.md)

## Global Constraints

これらは全タスクの要件に暗黙に含まれる。ステップ1から引き継ぐ。

- **ネットワークアクセスを一切書かない。** `fetch`、CDNの`<link>`、外部URLの画像は使用禁止。
- **UIの文言はすべて日本語。** エラー文は何が起きたかと次にどうするかを示す。謝罪表現は使わない。データ層の `ValidationError` の message はそのまま画面に出すこと。
- **配色トークンは5色のみ**: 画用紙 `#FBFAF7`(`gayoshi`) / 墨 `#1A1A1F`(`sumi`) / 藍 `#22406B`(`ai`) / 方眼 `#C9D6E4`(`kogan`) / 朱 `#D8452E`(`shu`)。**Tailwind素のカラー（`text-white`、`bg-gray-*` 等）を使ってはいけない。** 藍の上に載せる明色は `text-gayoshi`。
- **朱は「完全に削除」の確認ダイアログのみ。** トリガーには使わない。朱は18pt以上でのみ使う（コントラスト比が約4.3:1のため）。
- **書体**: 締切時刻などの数値は `font-num`、見出しは `font-display`(Klee One)。**Klee One を本文に使わない。**
- **`crypto.randomUUID()` を直接呼ばない。** 必ず `newId()`（`src/lib/id.ts`）を使う。
- **既存データを壊さない。** バージョン1のDBを持つ端末で生徒名簿が失われてはならない。
- スマホ幅375pxまで崩れない、キーボードフォーカスが見える、タップ領域は44px四方以上。
- TypeScriptは `strict: true`。`any` を使わない。
- **テストは非同期に変わる内容を1回だけ見て判定しない。** 現れる内容には `findBy*`、既存要素の属性には `waitFor` を使う。ステップ1でこの形の競合を5回踏んでいる。
- 各タスクの最後に必ずコミットする。

## 現状の前提（ステップ1完了時点）

- テスト123件が通っている。**終わったときも全部通っていること。**
- `npm run test:run`（単発実行）、`npm run build`（`tsc --noEmit && vite build`）
- `src/test/setup.ts` が `fake-indexeddb/auto` と `afterEach(cleanup)` を全体に読み込み済み。テストファイルで自分でimportしない
- `src/test/db.ts` の `useFreshDb()` をテストファイルの先頭で1回呼ぶ

---

### Task 1: DBをバージョン2に上げる

既存データを壊さずに `submissionTypes` ストアを追加する。**このタスクが最も慎重を要する** — 失敗すると先生の名簿が消える。

**Files:**
- Modify: `src/db/schema.ts`
- Test: `src/db/migration.test.ts`（新規）

**Interfaces:**
- Consumes: `openDB`, `DBSchema`, `IDBPDatabase`（`idb`）/ `StorageUnavailableError`（`./errors`）
- Produces:
  - `DB_VERSION = 2`
  - `type SubmissionStatus = "active" | "ended"`
  - `type SubmissionType = { id: string; cohortId: string; name: string; deadline: string; weekdays: number[]; status: SubmissionStatus; order: number; createdAt: number }`
  - `HomeworkDB` に `submissionTypes: { key: string; value: SubmissionType; indexes: { "by-cohort": string } }` が加わる

- [ ] **Step 1: 失敗するテストを書く**

`src/db/migration.test.ts`。**バージョン1のDBを手で作ってから**バージョン2で開き直し、データが残ることを確かめる。`idb` を経由せず生の `indexedDB` API でv1を作るのは、現在のコードがもうv2しか作らないため。

```ts
import { deleteDB, openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION, getDb, resetDbForTests } from "./schema";

afterEach(async () => {
  await resetDbForTests();
  await deleteDB(DB_NAME);
});

/** ステップ1時点（バージョン1）のDBを作り、生徒を1人入れる。 */
async function seedVersion1(): Promise<{ cohortId: string; studentId: string }> {
  const cohortId = "cohort-v1";
  const studentId = "student-v1";

  const db = await openDB(DB_NAME, 1, {
    upgrade(database) {
      const cohorts = database.createObjectStore("cohorts", { keyPath: "id" });
      cohorts.createIndex("by-year", "year");

      const students = database.createObjectStore("students", { keyPath: "id" });
      students.createIndex("by-cohort", "cohortId");
      students.createIndex("by-cohort-number", ["cohortId", "attendanceNumber"], {
        unique: true,
      });

      database.createObjectStore("settings", { keyPath: "key" });
    },
  });

  await db.put("cohorts", {
    id: cohortId,
    year: 2026,
    className: "5年1組",
    isActive: true,
    createdAt: 1,
  });
  await db.put("students", {
    id: studentId,
    cohortId,
    attendanceNumber: 12,
    name: "やまだ",
    status: "active",
    createdAt: 1,
  });
  await db.put("settings", { key: "showStudentNames", value: true });

  db.close();
  return { cohortId, studentId };
}

describe("バージョン1からバージョン2への移行", () => {
  it("クラスが残る", async () => {
    const { cohortId } = await seedVersion1();

    const db = await getDb();
    const cohort = await db.get("cohorts", cohortId);

    expect(cohort?.className).toBe("5年1組");
  });

  it("生徒が残る", async () => {
    const { studentId } = await seedVersion1();

    const db = await getDb();
    const student = await db.get("students", studentId);

    expect(student?.attendanceNumber).toBe(12);
    expect(student?.name).toBe("やまだ");
  });

  it("設定が残る", async () => {
    await seedVersion1();

    const db = await getDb();
    const row = await db.get("settings", "showStudentNames");

    expect(row?.value).toBe(true);
  });

  it("既存のインデックスが使える", async () => {
    const { cohortId } = await seedVersion1();

    const db = await getDb();
    const students = await db.getAllFromIndex("students", "by-cohort", cohortId);

    expect(students).toHaveLength(1);
  });

  it("submissionTypes ストアが追加される", async () => {
    await seedVersion1();

    const db = await getDb();

    expect(db.objectStoreNames.contains("submissionTypes")).toBe(true);
  });

  it("submissionTypes に by-cohort インデックスが張られる", async () => {
    await seedVersion1();

    const db = await getDb();
    const index = db
      .transaction("submissionTypes")
      .store.indexNames.contains("by-cohort");

    expect(index).toBe(true);
  });
});

describe("まっさらな端末でのバージョン2", () => {
  it("4つのストアがすべて作られる", async () => {
    const db = await getDb();

    expect(db.objectStoreNames.contains("cohorts")).toBe(true);
    expect(db.objectStoreNames.contains("students")).toBe(true);
    expect(db.objectStoreNames.contains("settings")).toBe(true);
    expect(db.objectStoreNames.contains("submissionTypes")).toBe(true);
  });

  it("バージョンが2である", async () => {
    expect(DB_VERSION).toBe(2);

    const db = await getDb();
    expect(db.version).toBe(2);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/db/migration.test.ts`
Expected: FAIL。`DB_VERSION` が 1 のため、v1のDBを開いても移行が走らず `submissionTypes` が存在しない。

- [ ] **Step 3: スキーマに型を足す**

`src/db/schema.ts` の `Setting` 型の下に追加する。

```ts
export type SubmissionStatus = "active" | "ended";

export type SubmissionType = {
  id: string;
  cohortId: string;
  /** 提出物名。先生が入力したそのままを保持する（比較時のみ正規化する）。 */
  name: string;
  /** "HH:mm" 24時間表記。例: "08:15"。Dateだと日付が付いて「毎日この時刻」を表せない。 */
  deadline: string;
  /** 0=日曜 〜 6=土曜。Date.getDay() と同じ番号。昇順・重複なしで保存する。 */
  weekdays: number[];
  status: SubmissionStatus;
  /** 表示順。小さいほど上。 */
  order: number;
  createdAt: number;
};
```

`HomeworkDB` インターフェイスに追加する。

```ts
  submissionTypes: {
    key: string;
    value: SubmissionType;
    indexes: { "by-cohort": string };
  };
```

- [ ] **Step 4: バージョンを上げ、移行を段階的にする**

`DB_VERSION` を `2` にする。

```ts
export const DB_VERSION = 2;
```

`upgrade` コールバックを書き換える。**`oldVersion` で分岐しないと、v1の端末で既存ストアを作り直そうとして失敗する。**

```ts
      upgrade(db, oldVersion) {
        // oldVersion で分岐する。まとめて作ると、既にストアがある端末で
        // createObjectStore が例外を投げ、名簿ごと開けなくなる。
        if (oldVersion < 1) {
          const cohorts = db.createObjectStore("cohorts", { keyPath: "id" });
          cohorts.createIndex("by-year", "year");

          const students = db.createObjectStore("students", { keyPath: "id" });
          students.createIndex("by-cohort", "cohortId");
          students.createIndex(
            "by-cohort-number",
            ["cohortId", "attendanceNumber"],
            { unique: true },
          );

          db.createObjectStore("settings", { keyPath: "key" });
        }

        if (oldVersion < 2) {
          const submissionTypes = db.createObjectStore("submissionTypes", {
            keyPath: "id",
          });
          submissionTypes.createIndex("by-cohort", "cohortId");
        }
      },
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `npm run test:run -- src/db/migration.test.ts`
Expected: PASS（8件）

- [ ] **Step 6: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 既存123件と新規8件で131件すべてPASS、型エラーなし。

**既存テストが1件でも落ちたら移行が壊れている。** その場合は先に進まず報告すること。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: DBをバージョン2に上げ submissionTypes ストアを追加"
```

---

### Task 2: 提出物のデータ層

**Files:**
- Create: `src/db/submissionTypes.ts`
- Test: `src/db/submissionTypes.test.ts`

**Interfaces:**
- Consumes: `getDb`, `SubmissionType`, `HomeworkDB`（`./schema`）/ `ValidationError`（`./errors`）/ `newId`（`../lib/id`）/ `createCohort`（`./cohorts`、テストで使用）
- Produces:
  - `listSubmissionTypes(cohortId: string): Promise<SubmissionType[]>` — `order` 昇順。終了したものも含む
  - `getSubmissionType(id: string): Promise<SubmissionType | null>`
  - `addSubmissionType(input: { cohortId: string; name: string; deadline: string; weekdays: number[] }): Promise<SubmissionType>`
  - `updateSubmissionType(id: string, changes: { name: string; deadline: string; weekdays: number[] }): Promise<SubmissionType>`
  - `endSubmissionType(id: string): Promise<SubmissionType>`
  - `restoreSubmissionType(id: string): Promise<SubmissionType>`
  - `deleteSubmissionType(id: string): Promise<void>`
  - `moveSubmissionType(id: string, direction: "up" | "down"): Promise<void>`
  - `normalizeName(name: string): string` — 比較用。`trim().normalize("NFKC").toLowerCase()`

- [ ] **Step 1: 失敗するテストを書く**

`src/db/submissionTypes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { ValidationError } from "./errors";
import {
  addSubmissionType,
  deleteSubmissionType,
  endSubmissionType,
  getSubmissionType,
  listSubmissionTypes,
  moveSubmissionType,
  normalizeName,
  restoreSubmissionType,
  updateSubmissionType,
} from "./submissionTypes";

useFreshDb();

let cohortId = "";

const WEEKDAYS = [1, 2, 3, 4, 5];

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function drill(overrides: Partial<Parameters<typeof addSubmissionType>[0]> = {}) {
  return addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline: "08:15",
    weekdays: WEEKDAYS,
    ...overrides,
  });
}

describe("normalizeName", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeName("  計算ドリル  ")).toBe("計算ドリル");
  });

  it("半角カタカナを全角に揃える", () => {
    expect(normalizeName("ﾄﾞﾘﾙ")).toBe(normalizeName("ドリル"));
  });

  it("英字の大小を揃える", () => {
    expect(normalizeName("Drill")).toBe(normalizeName("drill"));
  });
});

describe("addSubmissionType", () => {
  it("有効な提出物として登録する", async () => {
    const type = await drill();

    expect(type.status).toBe("active");
    expect(type.name).toBe("計算ドリル");
    expect(type.deadline).toBe("08:15");
    expect(type.weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it("入力したままの名前を保存する", async () => {
    const type = await drill({ name: "  Drill ノート  " });

    // 比較のときだけ正規化する。表示は先生が打った通りにする。
    expect(type.name).toBe("Drill ノート");
  });

  it("曜日を昇順に整列し重複を除く", async () => {
    const type = await drill({ weekdays: [5, 1, 3, 1] });

    expect(type.weekdays).toEqual([1, 3, 5]);
  });

  it("order を1から順に振る", async () => {
    const first = await drill({ name: "計算ドリル" });
    const second = await drill({ name: "音読カード" });

    expect(first.order).toBe(1);
    expect(second.order).toBe(2);
  });

  it("名前が空なら拒否する", async () => {
    await expect(drill({ name: "   " })).rejects.toThrow(
      new ValidationError("提出物の名前を入力してください"),
    );
  });

  it("曜日が空なら拒否する", async () => {
    await expect(drill({ weekdays: [] })).rejects.toThrow(
      new ValidationError("提出する曜日を1つ以上選んでください"),
    );
  });

  it("曜日に0〜6以外が混ざれば拒否する", async () => {
    await expect(drill({ weekdays: [1, 7] })).rejects.toThrow(
      new ValidationError("提出する曜日を1つ以上選んでください"),
    );
  });

  it("締切時刻が空なら拒否する", async () => {
    await expect(drill({ deadline: "" })).rejects.toThrow(
      new ValidationError("締切時刻を入力してください"),
    );
  });

  it("締切時刻の形式が違えば拒否する", async () => {
    await expect(drill({ deadline: "8時15分" })).rejects.toThrow(
      new ValidationError("締切時刻を入力してください"),
    );
  });

  it("ありえない時刻を拒否する", async () => {
    await expect(drill({ deadline: "25:00" })).rejects.toThrow(
      new ValidationError("締切時刻を入力してください"),
    );
  });

  it("有効な提出物と名前が重なれば拒否する", async () => {
    await drill();

    await expect(drill()).rejects.toThrow(
      new ValidationError("計算ドリルはすでに登録されています"),
    );
  });

  it("表記ゆれでも重複と見なす", async () => {
    await drill({ name: "ドリル" });

    await expect(drill({ name: " ﾄﾞﾘﾙ " })).rejects.toThrow(ValidationError);
  });

  it("終了した提出物と名前が重なれば理由を示して拒否する", async () => {
    const type = await drill();
    await endSubmissionType(type.id);

    await expect(drill()).rejects.toThrow(
      new ValidationError("計算ドリルは終了した提出物として登録されています"),
    );
  });

  it("別のcohortとは名前が重なってもよい", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addSubmissionType({
      cohortId: other.id,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: WEEKDAYS,
    });

    const type = await drill();
    expect(type.name).toBe("計算ドリル");
  });
});

describe("listSubmissionTypes", () => {
  it("order の昇順で返す", async () => {
    await drill({ name: "計算ドリル" });
    await drill({ name: "音読カード" });
    await drill({ name: "日記" });

    const names = (await listSubmissionTypes(cohortId)).map((t) => t.name);
    expect(names).toEqual(["計算ドリル", "音読カード", "日記"]);
  });

  it("終了したものも含めて返す", async () => {
    const type = await drill();
    await endSubmissionType(type.id);

    expect(await listSubmissionTypes(cohortId)).toHaveLength(1);
  });

  it("他のcohortのものを含めない", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addSubmissionType({
      cohortId: other.id,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: WEEKDAYS,
    });

    expect(await listSubmissionTypes(cohortId)).toHaveLength(0);
  });
});

describe("updateSubmissionType", () => {
  it("名前・締切・曜日を変更できる", async () => {
    const type = await drill();

    const updated = await updateSubmissionType(type.id, {
      name: "計算プリント",
      deadline: "08:30",
      weekdays: [1, 3, 5],
    });

    expect(updated.name).toBe("計算プリント");
    expect(updated.deadline).toBe("08:30");
    expect(updated.weekdays).toEqual([1, 3, 5]);
  });

  it("自分自身の名前のままなら通す", async () => {
    const type = await drill();

    const updated = await updateSubmissionType(type.id, {
      name: "計算ドリル",
      deadline: "08:30",
      weekdays: WEEKDAYS,
    });

    expect(updated.deadline).toBe("08:30");
  });

  it("他の提出物と名前が重なれば拒否する", async () => {
    await drill({ name: "計算ドリル" });
    const second = await drill({ name: "音読カード" });

    await expect(
      updateSubmissionType(second.id, {
        name: "計算ドリル",
        deadline: "08:15",
        weekdays: WEEKDAYS,
      }),
    ).rejects.toThrow(new ValidationError("計算ドリルはすでに登録されています"));
  });

  it("order と status は変えない", async () => {
    const type = await drill();
    await endSubmissionType(type.id);

    const updated = await updateSubmissionType(type.id, {
      name: "計算プリント",
      deadline: "08:15",
      weekdays: WEEKDAYS,
    });

    expect(updated.order).toBe(type.order);
    expect(updated.status).toBe("ended");
  });

  it("存在しないIDなら拒否する", async () => {
    await expect(
      updateSubmissionType("missing", {
        name: "計算ドリル",
        deadline: "08:15",
        weekdays: WEEKDAYS,
      }),
    ).rejects.toThrow(new ValidationError("この提出物は見つかりません"));
  });
});

describe("endSubmissionType と restoreSubmissionType", () => {
  it("終了にできる", async () => {
    const type = await drill();

    expect((await endSubmissionType(type.id)).status).toBe("ended");
  });

  it("有効に戻せる", async () => {
    const type = await drill();
    await endSubmissionType(type.id);

    expect((await restoreSubmissionType(type.id)).status).toBe("active");
  });

  it("存在しないIDなら拒否する", async () => {
    await expect(endSubmissionType("missing")).rejects.toThrow(
      new ValidationError("この提出物は見つかりません"),
    );
  });
});

describe("deleteSubmissionType", () => {
  it("削除すると一覧から消える", async () => {
    const type = await drill();
    await deleteSubmissionType(type.id);

    expect(await getSubmissionType(type.id)).toBeNull();
    expect(await listSubmissionTypes(cohortId)).toHaveLength(0);
  });

  it("削除した名前は再利用できる", async () => {
    const type = await drill();
    await deleteSubmissionType(type.id);

    const reused = await drill();
    expect(reused.name).toBe("計算ドリル");
    expect(reused.id).not.toBe(type.id);
  });
});

describe("moveSubmissionType", () => {
  async function names(): Promise<string[]> {
    return (await listSubmissionTypes(cohortId)).map((t) => t.name);
  }

  beforeEach(async () => {
    await drill({ name: "計算ドリル" });
    await drill({ name: "音読カード" });
    await drill({ name: "日記" });
  });

  it("上へ動かすと1つ前と入れ替わる", async () => {
    const list = await listSubmissionTypes(cohortId);
    await moveSubmissionType(list[1].id, "up");

    expect(await names()).toEqual(["音読カード", "計算ドリル", "日記"]);
  });

  it("下へ動かすと1つ後と入れ替わる", async () => {
    const list = await listSubmissionTypes(cohortId);
    await moveSubmissionType(list[1].id, "down");

    expect(await names()).toEqual(["計算ドリル", "日記", "音読カード"]);
  });

  it("先頭を上へ動かしても変わらない", async () => {
    const list = await listSubmissionTypes(cohortId);
    await moveSubmissionType(list[0].id, "up");

    expect(await names()).toEqual(["計算ドリル", "音読カード", "日記"]);
  });

  it("末尾を下へ動かしても変わらない", async () => {
    const list = await listSubmissionTypes(cohortId);
    await moveSubmissionType(list[2].id, "down");

    expect(await names()).toEqual(["計算ドリル", "音読カード", "日記"]);
  });

  it("終了したものを飛ばして入れ替える", async () => {
    const list = await listSubmissionTypes(cohortId);
    await endSubmissionType(list[1].id); // 音読カードを終了に

    // 日記から見た「上」は、終了した音読カードではなく計算ドリル
    await moveSubmissionType(list[2].id, "up");

    const active = (await listSubmissionTypes(cohortId))
      .filter((t) => t.status === "active")
      .map((t) => t.name);
    expect(active).toEqual(["日記", "計算ドリル"]);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/db/submissionTypes.test.ts`
Expected: FAIL。`Failed to resolve import "./submissionTypes"`

- [ ] **Step 3: データ層を実装する**

`src/db/submissionTypes.ts`:

```ts
import type { IDBPObjectStore } from "idb";
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
  const existing = await store.index("by-cohort").getAll(cohortId);

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
    .filter((type) => type.status === "active")
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
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm run test:run -- src/db/submissionTypes.test.ts`
Expected: PASS（35件）

- [ ] **Step 5: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 166件すべてPASS、型エラーなし。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat: 提出物のデータ層（曜日・締切・並べ替え）を追加"
```

---

### Task 3: 曜日トグルと共通表示

一覧・追加・編集の3画面が共有する部品を先に作る。

**Files:**
- Create: `src/lib/weekdays.ts`
- Create: `src/components/WeekdayPicker.tsx`
- Test: `src/lib/weekdays.test.ts`
- Test: `src/components/WeekdayPicker.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces:
  - `WEEKDAY_LABELS: readonly string[]` — `["日","月","火","水","木","金","土"]`
  - `formatWeekdays(weekdays: number[]): string` — すべて選択なら `"毎日"`、それ以外は `"月火水木金"`
  - `<WeekdayPicker value={number[]} onChange={(next: number[]) => void} />`

- [ ] **Step 1: 曜日の表示テストを書く**

`src/lib/weekdays.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatWeekdays, WEEKDAY_LABELS } from "./weekdays";

describe("WEEKDAY_LABELS", () => {
  it("日曜から土曜まで7つある", () => {
    expect(WEEKDAY_LABELS).toEqual(["日", "月", "火", "水", "木", "金", "土"]);
  });
});

describe("formatWeekdays", () => {
  it("平日を連結して返す", () => {
    expect(formatWeekdays([1, 2, 3, 4, 5])).toBe("月火水木金");
  });

  it("すべて選ばれていれば毎日と返す", () => {
    expect(formatWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe("毎日");
  });

  it("1つだけでも返せる", () => {
    expect(formatWeekdays([1])).toBe("月");
  });

  it("順番が入れ替わっていても曜日順に並べて返す", () => {
    expect(formatWeekdays([5, 1, 3])).toBe("月水金");
  });

  it("空なら未設定と返す", () => {
    // データ層が空を拒否するため通常は起きないが、
    // 画面が落ちないよう文字列を返す。
    expect(formatWeekdays([])).toBe("未設定");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/lib/weekdays.test.ts`
Expected: FAIL。`Failed to resolve import "./weekdays"`

- [ ] **Step 3: 曜日の表示を実装する**

`src/lib/weekdays.ts`:

```ts
/** 0=日曜 〜 6=土曜。Date.getDay() と同じ並び。 */
export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 一覧に出す曜日の表記。7つ揃っていれば「毎日」にする。 */
export function formatWeekdays(weekdays: number[]): string {
  if (weekdays.length === 0) {
    return "未設定";
  }
  if (weekdays.length === WEEKDAY_LABELS.length) {
    return "毎日";
  }

  return [...weekdays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day])
    .join("");
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm run test:run -- src/lib/weekdays.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: 曜日トグルのテストを書く**

`src/components/WeekdayPicker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WeekdayPicker } from "./WeekdayPicker";

describe("WeekdayPicker", () => {
  it("7つのボタンを出す", () => {
    render(<WeekdayPicker value={[]} onChange={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(7);
  });

  it("選択状態を aria-pressed で伝える", () => {
    render(<WeekdayPicker value={[1, 3]} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "月" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "火" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "水" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("選ばれていない曜日を押すと足して返す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[1]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "水" }));

    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it("選ばれている曜日を押すと外して返す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[1, 3]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "月" }));

    expect(onChange).toHaveBeenCalledWith([3]);
  });

  it("昇順に整列して返す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[5, 1]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "水" }));

    expect(onChange).toHaveBeenCalledWith([1, 3, 5]);
  });

  it("最後の1つを外すこともできる", async () => {
    // 空を弾くのは保存時。ここで押させないと直せなくなる。
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[1]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "月" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/components/WeekdayPicker.test.tsx`
Expected: FAIL。`Failed to resolve import "./WeekdayPicker"`

- [ ] **Step 7: 曜日トグルを実装する**

`src/components/WeekdayPicker.tsx`。**44px四方 × 7 + 間隔4px × 6 = 332px**。375px幅から左右パディング16px×2を引いた343pxに収まる（余裕11px）。

```tsx
import { WEEKDAY_LABELS } from "../lib/weekdays";

export function WeekdayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (next: number[]) => void;
}) {
  function toggle(day: number): void {
    const next = value.includes(day)
      ? value.filter((current) => current !== day)
      : [...value, day];

    onChange(next.sort((a, b) => a - b));
  }

  return (
    // 44px x7 + 間隔4px x6 = 332mm。375px幅（内寸343px）に収まる。
    // ボタンを大きくするときはこの式を計算し直すこと。
    <div className="flex gap-1">
      {WEEKDAY_LABELS.map((label, day) => {
        const selected = value.includes(day);

        return (
          <button
            key={label}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(day)}
            className={[
              "size-11 shrink-0 rounded font-bold",
              selected
                ? "bg-ai text-gayoshi"
                : "border-kogan text-sumi border-2",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `npm run test:run -- src/components/WeekdayPicker.test.tsx`
Expected: PASS（6件）

- [ ] **Step 9: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 178件すべてPASS、型エラーなし。

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "feat: 曜日トグルと曜日表記を追加"
```

---

### Task 4: 提出物の一覧画面

**Files:**
- Create: `src/hooks/useSubmissionTypes.ts`
- Create: `src/components/SubmissionRow.tsx`
- Create: `src/screens/SubmissionList.tsx`
- Modify: `src/App.tsx`（`/submissions` を追加）
- Modify: `src/screens/Roster.tsx`（`提出物の設定` の導線を追加）
- Test: `src/screens/SubmissionList.test.tsx`

**Interfaces:**
- Consumes: `listSubmissionTypes`, `moveSubmissionType`（`../db/submissionTypes`）/ `formatWeekdays`（`../lib/weekdays`）/ `useAsync`（`../hooks/useAsync`）/ `CohortGate`, `useActiveCohort` / `AppHeader` / `FullScreenMessage` / `SubmissionType`（`../db/schema`）
- Produces:
  - `useSubmissionTypes(cohortId: string): AsyncState<SubmissionType[]> & { reload: () => void }`
  - `<SubmissionRow type={SubmissionType} canMoveUp={boolean} canMoveDown={boolean} onMove={(direction: "up" | "down") => void} />` — `data-testid="submission-row"`、`data-status` に `active` / `ended`
  - `<SubmissionList />`

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/SubmissionList.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import {
  addSubmissionType,
  endSubmissionType,
  listSubmissionTypes,
} from "../db/submissionTypes";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function add(name: string, weekdays = [1, 2, 3, 4, 5], deadline = "08:15") {
  return addSubmissionType({ cohortId, name, deadline, weekdays });
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/submissions"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("ヘッダー", () => {
  it("年度とクラス名を出す", async () => {
    renderList();

    expect(await screen.findByText("2026年度 5年1組")).toBeInTheDocument();
  });

  it("有効な件数と終了した件数を出す", async () => {
    await add("計算ドリル");
    await add("音読カード");
    const ended = await add("日記");
    await endSubmissionType(ended.id);

    renderList();

    expect(await screen.findByText("提出物2件・終了1")).toBeInTheDocument();
  });
});

describe("一覧", () => {
  it("名前・締切・曜日を出す", async () => {
    await add("計算ドリル");
    renderList();

    const row = (await screen.findAllByTestId("submission-row"))[0];
    expect(within(row).getByText("計算ドリル")).toBeInTheDocument();
    expect(within(row).getByText("08:15")).toBeInTheDocument();
    expect(within(row).getByText("月火水木金")).toBeInTheDocument();
  });

  it("すべての曜日なら毎日と出す", async () => {
    await add("音読カード", [0, 1, 2, 3, 4, 5, 6]);
    renderList();

    expect(await screen.findByText("毎日")).toBeInTheDocument();
  });

  it("有効と終了を描き分ける", async () => {
    await add("計算ドリル");
    const ended = await add("日記");
    await endSubmissionType(ended.id);

    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    expect(rows[0]).toHaveAttribute("data-status", "active");
    expect(rows[1]).toHaveAttribute("data-status", "ended");
  });

  it("終了したものに（終了）を添える", async () => {
    const ended = await add("日記");
    await endSubmissionType(ended.id);

    renderList();

    expect(await screen.findByText(/日記（終了）/)).toBeInTheDocument();
  });

  it("行が編集画面へのリンクになっている", async () => {
    const type = await add("計算ドリル");
    renderList();

    const link = await screen.findByRole("link", { name: /計算ドリル/ });
    expect(link).toHaveAttribute("href", `/submissions/${type.id}/edit`);
  });
});

describe("並べ替え", () => {
  it("下へ押すと順番が入れ替わる", async () => {
    const user = userEvent.setup();
    await add("計算ドリル");
    await add("音読カード");
    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    await user.click(within(rows[0]).getByRole("button", { name: "下へ" }));

    const names = (await listSubmissionTypes(cohortId)).map((t) => t.name);
    expect(names).toEqual(["音読カード", "計算ドリル"]);
  });

  it("先頭の「上へ」は押せない", async () => {
    await add("計算ドリル");
    await add("音読カード");
    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    expect(within(rows[0]).getByRole("button", { name: "上へ" })).toBeDisabled();
  });

  it("末尾の「下へ」は押せない", async () => {
    await add("計算ドリル");
    await add("音読カード");
    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    expect(within(rows[1]).getByRole("button", { name: "下へ" })).toBeDisabled();
  });

  it("終了したものに並べ替えボタンを出さない", async () => {
    const ended = await add("日記");
    await endSubmissionType(ended.id);
    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    expect(within(rows[0]).queryByRole("button", { name: "上へ" })).toBeNull();
    expect(within(rows[0]).queryByRole("button", { name: "下へ" })).toBeNull();
  });
});

describe("提出物が無いとき", () => {
  it("空状態の案内を出す", async () => {
    renderList();

    expect(
      await screen.findByText("まず提出物を追加してください"),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("submission-row")).toHaveLength(0);
  });
});

describe("導線", () => {
  it("追加への導線がある", async () => {
    renderList();

    expect(
      await screen.findByRole("link", { name: "提出物を追加" }),
    ).toHaveAttribute("href", "/submissions/new");
  });

  it("名簿から提出物の設定に入れる", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/roster"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "提出物の設定" }));

    expect(await screen.findByText("提出物0件・終了0")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/screens/SubmissionList.test.tsx`
Expected: FAIL。`/submissions` が未定義のため名簿にリダイレクトされる。

- [ ] **Step 3: 一覧フックを作る**

`src/hooks/useSubmissionTypes.ts`:

```ts
import type { SubmissionType } from "../db/schema";
import { listSubmissionTypes } from "../db/submissionTypes";
import { useAsync, type AsyncState } from "./useAsync";

export function useSubmissionTypes(
  cohortId: string,
): AsyncState<SubmissionType[]> & { reload: () => void } {
  return useAsync(
    () => listSubmissionTypes(cohortId),
    `submission-types:${cohortId}`,
  );
}
```

- [ ] **Step 4: 行を作る**

`src/components/SubmissionRow.tsx`:

```tsx
import { Link } from "react-router";
import type { SubmissionType } from "../db/schema";
import { formatWeekdays } from "../lib/weekdays";

export function SubmissionRow({
  type,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  type: SubmissionType;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  const ended = type.status === "ended";

  return (
    <div
      data-testid="submission-row"
      data-status={type.status}
      className={[
        "flex items-center gap-2 rounded p-3",
        ended
          ? "border-kogan text-kogan hatch border-2 border-dashed"
          : "border-ai text-sumi border-2",
      ].join(" ")}
    >
      <Link to={`/submissions/${type.id}/edit`} className="min-w-0 flex-1">
        <span className="block truncate font-bold">
          {ended ? `${type.name}（終了）` : type.name}
        </span>
        <span className="mt-1 flex gap-3 text-sm">
          <span className="font-num">{type.deadline}</span>
          <span>{formatWeekdays(type.weekdays)}</span>
        </span>
      </Link>

      {!ended && (
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            aria-label="上へ"
            disabled={!canMoveUp}
            onClick={() => onMove("up")}
            className="border-ai text-ai size-11 rounded border-2 font-bold disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="下へ"
            disabled={!canMoveDown}
            onClick={() => onMove("down")}
            className="border-ai text-ai size-11 rounded border-2 font-bold disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 一覧画面を作る**

`src/screens/SubmissionList.tsx`:

```tsx
import { Link } from "react-router";
import { AppHeader } from "../components/AppHeader";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { SubmissionRow } from "../components/SubmissionRow";
import { moveSubmissionType } from "../db/submissionTypes";
import { useSubmissionTypes } from "../hooks/useSubmissionTypes";

function SubmissionListBody() {
  const cohort = useActiveCohort();
  const types = useSubmissionTypes(cohort.id);

  if (types.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (types.status === "error") {
    return <FullScreenMessage tone="error">{types.message}</FullScreenMessage>;
  }

  const list = types.data;
  const active = list.filter((type) => type.status === "active");
  const ended = list.filter((type) => type.status === "ended");

  // 終了したものは並べ替えの対象外なので末尾へ回す
  const ordered = [...active, ...ended];

  function handleMove(id: string, direction: "up" | "down"): void {
    void moveSubmissionType(id, direction).then(() => types.reload());
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <AppHeader
        cohort={cohort}
        subtitle={`提出物${active.length}件・終了${ended.length}`}
      />

      {list.length === 0 ? (
        <p className="text-ai py-12 text-center">まず提出物を追加してください</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ordered.map((type) => {
            const index = active.findIndex((current) => current.id === type.id);

            return (
              <li key={type.id}>
                <SubmissionRow
                  type={type}
                  canMoveUp={index > 0}
                  canMoveDown={index !== -1 && index < active.length - 1}
                  onMove={(direction) => handleMove(type.id, direction)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <nav className="mt-auto flex gap-3 pt-4">
        <Link
          to="/submissions/new"
          className="bg-ai flex-1 rounded px-4 py-3 text-center font-bold text-gayoshi"
        >
          提出物を追加
        </Link>
        <Link
          to="/roster"
          className="border-ai text-ai flex-1 rounded border-2 px-4 py-3 text-center font-bold"
        >
          名簿に戻る
        </Link>
      </nav>
    </main>
  );
}

export function SubmissionList() {
  return (
    <CohortGate>
      <SubmissionListBody />
    </CohortGate>
  );
}
```

- [ ] **Step 6: ルートと名簿の導線を足す**

`src/App.tsx` に import と Route を1行ずつ足す。`*` のリダイレクトより前に置くこと。

```tsx
import { SubmissionList } from "./screens/SubmissionList";
```

```tsx
      <Route path="/submissions" element={<SubmissionList />} />
```

`src/screens/Roster.tsx` の `<nav>` を2行に分ける。375px幅で3つ横並びは窮屈なため。

```tsx
      <nav className="mt-auto flex flex-col gap-3 pt-4">
        <Link
          to="/roster/new"
          className="bg-ai rounded px-4 py-3 text-center font-bold text-gayoshi"
        >
          生徒を追加
        </Link>
        <div className="flex gap-3">
          <Link
            to="/print"
            className="border-ai text-ai flex-1 rounded border-2 px-4 py-3 text-center font-bold"
          >
            QRを印刷
          </Link>
          <Link
            to="/submissions"
            className="border-ai text-ai flex-1 rounded border-2 px-4 py-3 text-center font-bold"
          >
            提出物の設定
          </Link>
        </div>
      </nav>
```

- [ ] **Step 7: テストを実行して成功を確認する**

Run: `npm run test:run -- src/screens/SubmissionList.test.tsx`
Expected: PASS（14件）

- [ ] **Step 8: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 192件すべてPASS。**名簿画面のテストが落ちていないことを特に確認すること**（`<nav>` の構造を変えたため）。

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -m "feat: 提出物の一覧画面と名簿からの導線を追加"
```

---

### Task 5: 提出物の追加・編集画面

**Files:**
- Create: `src/components/SubmissionForm.tsx`
- Create: `src/screens/SubmissionNew.tsx`
- Create: `src/screens/SubmissionEdit.tsx`
- Modify: `src/App.tsx`（2ルート追加）
- Test: `src/screens/SubmissionNew.test.tsx`
- Test: `src/screens/SubmissionEdit.test.tsx`

**Interfaces:**
- Consumes: `addSubmissionType`, `updateSubmissionType`, `getSubmissionType`, `endSubmissionType`, `restoreSubmissionType`, `deleteSubmissionType`（`../db/submissionTypes`）/ `WeekdayPicker` / `ConfirmDialog` / `CohortGate`, `useActiveCohort` / `FullScreenMessage` / `useAsync`
- Produces:
  - `type SubmissionFormValues = { name: string; deadline: string; weekdays: number[] }`
  - `<SubmissionForm defaultValues error submitting primaryLabel onSubmit />`
  - `<SubmissionNew />` / `<SubmissionEdit />`

- [ ] **Step 1: 追加画面のテストを書く**

`src/screens/SubmissionNew.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import {
  addSubmissionType,
  endSubmissionType,
  listSubmissionTypes,
} from "../db/submissionTypes";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderNew() {
  return render(
    <MemoryRouter initialEntries={["/submissions/new"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("初期値", () => {
  it("締切は8:15から始まる", async () => {
    renderNew();

    expect(await screen.findByLabelText("締切時刻")).toHaveValue("08:15");
  });

  it("曜日は月から金が選ばれている", async () => {
    renderNew();

    await screen.findByLabelText("締切時刻");
    for (const label of ["月", "火", "水", "木", "金"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    for (const label of ["日", "土"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });
});

describe("保存", () => {
  it("保存すると一覧に戻り件数が増える", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "計算ドリル");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(await screen.findByText("提出物1件・終了0")).toBeInTheDocument();
    expect(await listSubmissionTypes(cohortId)).toHaveLength(1);
  });

  it("曜日を変えて保存できる", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "日記");
    await user.click(screen.getByRole("button", { name: "火" }));
    await user.click(screen.getByRole("button", { name: "水" }));
    await user.click(screen.getByRole("button", { name: "木" }));
    await user.click(screen.getByRole("button", { name: "金" }));
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("提出物1件・終了0");
    const types = await listSubmissionTypes(cohortId);
    expect(types[0].weekdays).toEqual([1]);
  });
});

describe("入力の検証", () => {
  it("名前が空ならエラーを出し保存しない", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.click(await screen.findByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("提出物の名前を入力してください"),
    ).toBeInTheDocument();
    expect(await listSubmissionTypes(cohortId)).toHaveLength(0);
  });

  it("曜日をすべて外すとエラーを出す", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "日記");
    for (const label of ["月", "火", "水", "木", "金"]) {
      await user.click(screen.getByRole("button", { name: label }));
    }
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("提出する曜日を1つ以上選んでください"),
    ).toBeInTheDocument();
  });

  it("名前が重複すればエラーを出す", async () => {
    const user = userEvent.setup();
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "計算ドリル");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("計算ドリルはすでに登録されています"),
    ).toBeInTheDocument();
  });

  it("終了したものと重複すれば理由を示す", async () => {
    const user = userEvent.setup();
    const type = await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "08:15",
      weekdays: [1],
    });
    await endSubmissionType(type.id);
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "日記");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("日記は終了した提出物として登録されています"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 編集画面のテストを書く**

`src/screens/SubmissionEdit.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import {
  addSubmissionType,
  endSubmissionType,
  getSubmissionType,
  listSubmissionTypes,
} from "../db/submissionTypes";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function add(name = "計算ドリル", weekdays = [1, 2, 3, 4, 5]) {
  return addSubmissionType({ cohortId, name, deadline: "08:15", weekdays });
}

function renderEdit(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/submissions/${id}/edit`]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("読み込み", () => {
  it("いまの値を出す", async () => {
    const type = await add("音読カード", [1, 3, 5]);
    renderEdit(type.id);

    expect(await screen.findByLabelText("提出物の名前")).toHaveValue("音読カード");
    expect(screen.getByLabelText("締切時刻")).toHaveValue("08:15");
    expect(screen.getByRole("button", { name: "水" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "火" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("居ない提出物なら見つからないと伝える", async () => {
    renderEdit("missing");

    expect(
      await screen.findByText("この提出物は見つかりません"),
    ).toBeInTheDocument();
  });
});

describe("保存", () => {
  it("締切を変えられる", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    const deadline = await screen.findByLabelText("締切時刻");
    await user.clear(deadline);
    await user.type(deadline, "08:30");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("提出物1件・終了0");
    expect((await getSubmissionType(type.id))?.deadline).toBe("08:30");
  });

  it("他と名前が重なれば拒否する", async () => {
    const user = userEvent.setup();
    await add("計算ドリル");
    const second = await add("音読カード");
    renderEdit(second.id);

    const name = await screen.findByLabelText("提出物の名前");
    await user.clear(name);
    await user.type(name, "計算ドリル");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("計算ドリルはすでに登録されています"),
    ).toBeInTheDocument();
  });
});

describe("終了", () => {
  it("確認してから終了にする", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "終了にする" }));

    // 「終了にする」は画面とダイアログの両方にあるためダイアログ内に絞る
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "終了にする" }));

    await screen.findByText("提出物0件・終了1");
    expect((await getSubmissionType(type.id))?.status).toBe("ended");
  });

  it("取り消せば何も起きない", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "終了にする" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect((await getSubmissionType(type.id))?.status).toBe("active");
  });

  it("終了済みなら有効に戻せる", async () => {
    const user = userEvent.setup();
    const type = await add();
    await endSubmissionType(type.id);
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "有効に戻す" }));

    await screen.findByText("提出物1件・終了0");
    expect((await getSubmissionType(type.id))?.status).toBe("active");
  });
});

describe("完全に削除", () => {
  it("確認したうえで削除する", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "完全に削除" }));
    expect(
      await screen.findByText("この提出物の記録は元に戻せません"),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    await screen.findByText("まず提出物を追加してください");
    expect(await listSubmissionTypes(cohortId)).toHaveLength(0);
  });

  it("取り消せば消えない", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "完全に削除" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect(await getSubmissionType(type.id)).not.toBeNull();
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/screens/SubmissionNew.test.tsx src/screens/SubmissionEdit.test.tsx`
Expected: FAIL。両ルートが未定義のため名簿にリダイレクトされる。

- [ ] **Step 4: フォームを作る**

`src/components/SubmissionForm.tsx`。**props からの同期用 `useEffect` は置かない** — ステップ1で、初回描画から effect 実行までの間の入力を巻き戻すバグを踏んでいる。値を作り直したいときは呼び出し側が `key` を変える。

```tsx
import { useState, type FormEvent } from "react";
import { WeekdayPicker } from "./WeekdayPicker";

export type SubmissionFormValues = {
  name: string;
  deadline: string;
  weekdays: number[];
};

export function SubmissionForm({
  defaultValues,
  error,
  submitting,
  primaryLabel,
  onSubmit,
}: {
  defaultValues: SubmissionFormValues;
  error: string | null;
  submitting: boolean;
  primaryLabel: string;
  onSubmit: (values: SubmissionFormValues) => void;
}) {
  // props からの同期用 useEffect は置かない。
  // 初回描画から effect 実行までの間に入力された値を上書きしてしまうため。
  const [name, setName] = useState(defaultValues.name);
  const [deadline, setDeadline] = useState(defaultValues.deadline);
  const [weekdays, setWeekdays] = useState(defaultValues.weekdays);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ name, deadline, weekdays });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">提出物の名前</span>
        <input
          type="text"
          value={name}
          placeholder="計算ドリル"
          onChange={(event) => setName(event.target.value)}
          className="border-ai rounded border-2 px-3 py-2 text-xl"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">締切時刻</span>
        <input
          type="time"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
          className="border-ai font-num w-40 rounded border-2 px-3 py-2 text-2xl"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">提出する曜日</span>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} />
      </div>

      {error !== null && (
        <p role="alert" className="text-sm font-bold">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-ai rounded px-4 py-3 font-bold text-gayoshi disabled:opacity-50"
      >
        {primaryLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: 追加画面を作る**

`src/screens/SubmissionNew.tsx`:

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import {
  SubmissionForm,
  type SubmissionFormValues,
} from "../components/SubmissionForm";
import { addSubmissionType } from "../db/submissionTypes";

function SubmissionNewBody() {
  const cohort = useActiveCohort();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(values: SubmissionFormValues) {
    setSubmitting(true);
    setError(null);

    void addSubmissionType({ cohortId: cohort.id, ...values })
      .then(() => navigate("/submissions"))
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
        setSubmitting(false);
      });
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">提出物を追加</h1>

      <div className="mt-6">
        <SubmissionForm
          defaultValues={{
            name: "",
            deadline: "08:15",
            weekdays: [1, 2, 3, 4, 5],
          }}
          error={error}
          submitting={submitting}
          primaryLabel="保存する"
          onSubmit={handleSubmit}
        />
      </div>

      <Link to="/submissions" className="text-ai mt-6 inline-block underline">
        提出物の一覧に戻る
      </Link>
    </main>
  );
}

export function SubmissionNew() {
  return (
    <CohortGate>
      <SubmissionNewBody />
    </CohortGate>
  );
}
```

- [ ] **Step 6: 編集画面を作る**

`src/screens/SubmissionEdit.tsx`。生徒の編集画面と同じ構造にする。

```tsx
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CohortGate } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullScreenMessage } from "../components/FullScreenMessage";
import {
  SubmissionForm,
  type SubmissionFormValues,
} from "../components/SubmissionForm";
import {
  deleteSubmissionType,
  endSubmissionType,
  getSubmissionType,
  restoreSubmissionType,
  updateSubmissionType,
} from "../db/submissionTypes";
import { useAsync } from "../hooks/useAsync";

type Pending = "end" | "delete" | null;

function SubmissionEditBody({ typeId }: { typeId: string }) {
  const navigate = useNavigate();
  const loaded = useAsync(
    () => getSubmissionType(typeId),
    `submission-type:${typeId}`,
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  if (loaded.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (loaded.status === "error") {
    return <FullScreenMessage tone="error">{loaded.message}</FullScreenMessage>;
  }
  if (loaded.data === null) {
    return (
      <FullScreenMessage tone="error">この提出物は見つかりません</FullScreenMessage>
    );
  }

  const type = loaded.data;
  const ended = type.status === "ended";

  function run(action: () => Promise<unknown>): void {
    setSubmitting(true);
    setError(null);

    void action()
      .then(() => navigate("/submissions"))
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
        setSubmitting(false);
      });
  }

  function handleSubmit(values: SubmissionFormValues) {
    run(() => updateSubmissionType(type.id, values));
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">{type.name}を編集</h1>

      <div className="mt-6">
        <SubmissionForm
          key={type.id}
          defaultValues={{
            name: type.name,
            deadline: type.deadline,
            weekdays: type.weekdays,
          }}
          error={error}
          submitting={submitting}
          primaryLabel="保存する"
          onSubmit={handleSubmit}
        />
      </div>

      <section className="border-kogan mt-10 border-t pt-6">
        <h2 className="font-display text-ai text-lg">使用の停止</h2>

        {ended ? (
          <>
            <p className="mt-2 text-sm">
              いまは終了として扱っています。スキャン画面と未提出者一覧には出ません。
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => run(() => restoreSubmissionType(type.id))}
              className="border-ai text-ai mt-3 rounded border-2 px-4 py-2 font-bold disabled:opacity-50"
            >
              有効に戻す
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm">
              終了にすると、スキャン画面と未提出者一覧から外れます。
              これまでの提出記録と集計には残ります。
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setPending("end")}
              className="border-ai text-ai mt-3 rounded border-2 px-4 py-2 font-bold disabled:opacity-50"
            >
              終了にする
            </button>
          </>
        )}
      </section>

      <section className="border-kogan mt-8 border-t pt-6">
        <h2 className="font-display text-lg">記録を消す</h2>
        <p className="mt-2 text-sm">
          完全に削除すると、この提出物の名前を再び使えるようになります。
          終了とは違い、これまでの記録は残りません。
        </p>
        <button
          type="button"
          disabled={submitting}
          onClick={() => setPending("delete")}
          className="text-ai mt-3 font-bold underline disabled:opacity-50"
        >
          完全に削除
        </button>
      </section>

      <Link to="/submissions" className="text-ai mt-8 inline-block underline">
        提出物の一覧に戻る
      </Link>

      {pending === "end" && (
        <ConfirmDialog
          title="終了にしますか"
          message="これまでの提出記録と集計には残ります。"
          confirmLabel="終了にする"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            run(() => endSubmissionType(type.id));
          }}
        />
      )}

      {pending === "delete" && (
        <ConfirmDialog
          title="完全に削除しますか"
          message="この提出物の記録は元に戻せません"
          confirmLabel="削除する"
          tone="danger"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            run(() => deleteSubmissionType(type.id));
          }}
        />
      )}
    </main>
  );
}

export function SubmissionEdit() {
  const { id } = useParams();

  if (id === undefined) {
    return (
      <FullScreenMessage tone="error">この提出物は見つかりません</FullScreenMessage>
    );
  }

  return (
    <CohortGate>
      <SubmissionEditBody typeId={id} />
    </CohortGate>
  );
}
```

- [ ] **Step 7: ルートを足す**

`src/App.tsx` に import 2行と Route 2行を足す。`*` のリダイレクトより前に置くこと。

```tsx
import { SubmissionEdit } from "./screens/SubmissionEdit";
import { SubmissionNew } from "./screens/SubmissionNew";
```

```tsx
      <Route path="/submissions/new" element={<SubmissionNew />} />
      <Route path="/submissions/:id/edit" element={<SubmissionEdit />} />
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `npm run test:run -- src/screens/SubmissionNew.test.tsx src/screens/SubmissionEdit.test.tsx`
Expected: PASS（SubmissionNew 8件、SubmissionEdit 9件）

- [ ] **Step 9: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 209件すべてPASS、型エラーなし。

- [ ] **Step 10: 連続実行で安定を確認する**

Run: `npm run test:run`（3回連続）
Expected: 3回とも全件PASS。このプロジェクトは負荷依存のテスト競合を5回踏んでいるため、1回では取りこぼす。

- [ ] **Step 11: コミット**

```bash
git add -A
git commit -m "feat: 提出物の追加・編集画面（終了・復帰・完全削除）を追加"
```

---

## 完了条件

- `npm run test:run` が全件PASSする（3回連続で確認）
- `npm run build` が型エラーなく通る
- **バージョン1のDBを持つ端末で生徒名簿が失われない**（マイグレーションのテストで担保）
- 名簿 → 提出物の設定 → 追加 → 一覧 → 編集 → 終了 → 一覧、まで通せる

## 手動確認が必要な項目

サブエージェントはブラウザを開けないため、以下は人の目でしか確かめられない。

- 曜日トグル7つが375px幅で1行に収まること（計算上は332px、内寸343pxに対し余裕11mm）
- `<input type="time">` がiOS/Androidで期待どおりの時刻ピッカーを出すこと
- 名簿の下部ボタンが2行になっても窮屈でないこと
- **ステップ1のDBを持つ実機で開き、名簿が残っていること**

## 次のステップ

ステップ3（スキャン画面・複数選択モード）へ進む。`submissionTypes` の `order` がそこで効いてくる。
