# 生徒名簿 + QR発行・印刷 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小学校の担任が、クラスの生徒を出席番号で登録し、ラミネート用のQRカードをA4に印刷できるオフライン動作のWebアプリを作る。

**Architecture:** React + Vite のシングルページアプリ。すべてのデータはIndexedDBに端末内保存し、ネットワークを一切使わない。データ層（`src/db/`）はReactに依存しない純粋な非同期関数として切り出し、`fake-indexeddb` で単体テストする。画面（`src/screens/`）はデータ層を薄いフック経由で読み、表示に専念する。

**Tech Stack:** React 19 / Vite 8 / TypeScript 5.9 / Tailwind CSS 4（CSS-first設定）/ react-router 8 / idb 8 / qrcode 1.5 / Vitest 4 + React Testing Library + fake-indexeddb

設計書: [`docs/superpowers/specs/2026-08-23-student-roster-qr-design.md`](../specs/2026-08-23-student-roster-qr-design.md)

## Global Constraints

これらは全タスクの要件に暗黙に含まれる。

- **ネットワークアクセスを一切書かない。** `fetch`、CDNの`<link>`、外部URLの画像は使用禁止。フォントは `@fontsource/*` でバンドルする。
- **UIの文言はすべて日本語。** エラー文は何が起きたかと次にどうするかを示す。謝罪表現（「申し訳ありません」等）は使わない。
- **配色トークンは5色のみ**: 画用紙 `#FBFAF7` / 墨 `#1A1A1F` / 藍 `#22406B` / 方眼 `#C9D6E4` / 朱 `#D8452E`。**朱はステップ1では「完全に削除」の確認ダイアログにのみ使う。** それ以外の場所に朱を出してはいけない。
- **書体**: 本文・UIは `BIZ UDPGothic`、出席番号などの数値は `BIZ UDGothic`（700）、見出しは `Klee One`（600）。**Klee One を本文に使わない。**
- **`crypto.randomUUID()` を直接呼ばない。** http:// のLAN配信では secure context ではないため未定義になる。必ず `newId()`（Task 2）を使う。
- **QRのペイロードは `hw1:` + 生徒の内部ID。** 出席番号を埋め込んではいけない。誤り訂正レベルは `Q`。
- **出席番号の一意性は `status` に関わらずcohort内で保証する。**
- **スマホ幅375pxまで崩れない**、キーボードフォーカスが見える、`prefers-reduced-motion` を尊重する。
- TypeScriptは `strict: true`。`any` を使わない。
- 各タスクの最後に必ずコミットする。

---

### Task 1: プロジェクト基盤とデザイントークン

Vite + React + TypeScript + Tailwind v4 + Vitest を立ち上げ、テストが動くことを「学校年度の算出」のTDDサイクルで証明する。

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles/index.css`
- Create: `src/test/setup.ts`
- Create: `src/lib/schoolYear.ts`
- Test: `src/lib/schoolYear.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `currentSchoolYear(now?: Date): number` — 日本の学校年度を返す
  - Tailwindユーティリティ: `bg-gayoshi` `text-sumi` `text-ai` `border-ai` `border-kogan` `text-kogan` `bg-shu` `text-shu` `font-ui` `font-num` `font-display` `hatch`
  - npmスクリプト: `npm run dev` / `npm run build` / `npm test` / `npm run test:run`

- [ ] **Step 1: `package.json` を作る**

```json
{
  "name": "homework-tracker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@fontsource/biz-udgothic": "^5.3.0",
    "@fontsource/biz-udpgothic": "^5.3.0",
    "@fontsource/klee-one": "^5.3.0",
    "idb": "^8.0.3",
    "qrcode": "^1.5.4",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router": "^8.3.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.6",
    "@types/qrcode": "^1.5.6",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "@vitejs/plugin-react": "^6.1.0",
    "fake-indexeddb": "^6.2.5",
    "jsdom": "^30.0.1",
    "tailwindcss": "^4.3.3",
    "typescript": "~5.9.3",
    "vite": "^8.2.2",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: `.gitignore` を作る**

```
node_modules/
dist/
.DS_Store
*.local
```

- [ ] **Step 3: 依存をインストールする**

Run: `npm install`
Expected: エラーなく完了し、`node_modules/` が作られる。

- [ ] **Step 4: `tsconfig.json` を作る**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 5: `vite.config.ts` を作る**

`defineConfig` は `vitest/config` から取る。`vite` から取ると `test` フィールドが型エラーになる。

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
```

- [ ] **Step 6: `src/test/setup.ts` を作る**

`fake-indexeddb/auto` はここで読み込む。テストファイル側のimport順に依存しなくなる。

```ts
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: 失敗するテストを書く**

`src/lib/schoolYear.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { currentSchoolYear } from "./schoolYear";

describe("currentSchoolYear", () => {
  it("4月以降はその年をそのまま年度として返す", () => {
    expect(currentSchoolYear(new Date(2026, 7, 23))).toBe(2026);
  });

  it("4月1日は新年度の初日として扱う", () => {
    expect(currentSchoolYear(new Date(2026, 3, 1))).toBe(2026);
  });

  it("3月31日はまだ前年度として扱う", () => {
    expect(currentSchoolYear(new Date(2026, 2, 31))).toBe(2025);
  });

  it("1月は前年度として扱う", () => {
    expect(currentSchoolYear(new Date(2026, 0, 15))).toBe(2025);
  });
});
```

- [ ] **Step 8: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/lib/schoolYear.test.ts`
Expected: FAIL。`Failed to resolve import "./schoolYear"` が出る。

- [ ] **Step 9: 最小の実装を書く**

`src/lib/schoolYear.ts`:

```ts
/** 日本の学校年度を返す。年度は4月に始まり翌年3月に終わる。 */
export function currentSchoolYear(now: Date = new Date()): number {
  const month = now.getMonth() + 1;
  return month <= 3 ? now.getFullYear() - 1 : now.getFullYear();
}
```

- [ ] **Step 10: テストを実行して成功を確認する**

Run: `npm run test:run -- src/lib/schoolYear.test.ts`
Expected: PASS（4件）

- [ ] **Step 11: デザイントークンのCSSを作る**

`src/styles/index.css`。Tailwind v4 はCSSで設定するため `tailwind.config.js` は作らない。

```css
@import "tailwindcss";

@theme {
  --color-gayoshi: #fbfaf7;
  --color-sumi: #1a1a1f;
  --color-ai: #22406b;
  --color-kogan: #c9d6e4;
  --color-shu: #d8452e;

  --font-ui: "BIZ UDPGothic", system-ui, sans-serif;
  --font-num: "BIZ UDGothic", ui-monospace, monospace;
  --font-display: "Klee One", serif;
}

/* 欠番セルの斜めハッチ */
@utility hatch {
  background-image: repeating-linear-gradient(
    45deg,
    var(--color-kogan) 0 1px,
    transparent 1px 7px
  );
}

body {
  background-color: var(--color-gayoshi);
  color: var(--color-sumi);
  font-family: var(--font-ui);
}

:focus-visible {
  outline: 3px solid var(--color-ai);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 12: `index.html` を作る**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>宿題提出管理</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 13: エントリポイントを作る**

`src/main.tsx`。フォントはここで読み込む。BIZ UDGothic は数値専用なので700のみ。

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/biz-udpgothic/400.css";
import "@fontsource/biz-udpgothic/700.css";
import "@fontsource/biz-udgothic/700.css";
import "@fontsource/klee-one/600.css";
import "./styles/index.css";

import { App } from "./App";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root が見つかりません");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`（Task 5 で中身を差し替える仮の画面）:

```tsx
import { currentSchoolYear } from "./lib/schoolYear";

export function App() {
  return (
    <main className="p-6">
      <h1 className="font-display text-ai text-3xl">宿題提出管理</h1>
      <p className="mt-2 font-num text-2xl">{currentSchoolYear()}年度</p>
    </main>
  );
}
```

- [ ] **Step 14: 型チェックとビルドが通ることを確認する**

Run: `npm run build`
Expected: 型エラーなくビルドが成功し、`dist/` が作られる。

- [ ] **Step 15: 開発サーバーで表示を目視確認する**

Run: `npm run dev`
Expected: ブラウザで見出しが藍色のKlee One、年度がBIZ UDGothic、背景が画用紙色で表示される。確認したらサーバーを止める。

- [ ] **Step 16: コミット**

```bash
git add -A
git commit -m "feat: プロジェクト基盤とデザイントークンを追加"
```

---

### Task 2: IndexedDBのスキーマ、cohort、設定のデータ層

年度＋クラス（cohort）と設定の保存を作る。ここでDBの開き方とテストの土台が決まる。

**Files:**
- Create: `src/db/errors.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/cohorts.ts`
- Create: `src/db/settings.ts`
- Create: `src/lib/id.ts`
- Create: `src/test/db.ts`
- Test: `src/lib/id.test.ts`
- Test: `src/db/cohorts.test.ts`
- Test: `src/db/settings.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `type Cohort = { id: string; year: number; className: string; isActive: boolean; createdAt: number }`
  - `type StudentStatus = "active" | "transferredOut"`
  - `type Student = { id: string; cohortId: string; attendanceNumber: number; name: string; status: StudentStatus; createdAt: number }`
  - `getDb(): Promise<IDBPDatabase<HomeworkDB>>`
  - `resetDbForTests(): Promise<void>`
  - `DB_NAME: string`
  - `class ValidationError extends Error`
  - `class StorageUnavailableError extends Error`
  - `newId(): string`
  - `createCohort(input: { year: number; className: string }): Promise<Cohort>`
  - `getActiveCohort(): Promise<Cohort | null>`
  - `SETTING_DEFAULTS: { showStudentNames: false; rosterHintDismissed: false }`
  - `type SettingKey = "showStudentNames" | "rosterHintDismissed"`
  - `getSetting(key: SettingKey): Promise<boolean>`
  - `setSetting(key: SettingKey, value: boolean): Promise<void>`

- [ ] **Step 1: `newId` の失敗するテストを書く**

`src/lib/id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newId } from "./id";

describe("newId", () => {
  it("UUIDの形式を返す", () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("呼ぶたびに違う値を返す", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/lib/id.test.ts`
Expected: FAIL。`Failed to resolve import "./id"`

- [ ] **Step 3: `newId` を実装する**

`src/lib/id.ts`。`crypto.randomUUID` は secure context でしか使えず、http:// のLAN配信では未定義になる。`getRandomValues` はその制限がないためフォールバックに使う。

```ts
/** UUID v4 を返す。secure context でない環境でも動く。 */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm run test:run -- src/lib/id.test.ts`
Expected: PASS（2件）

- [ ] **Step 5: エラー型を作る**

`src/db/errors.ts`:

```ts
/** 入力値が不正なときに投げる。message はそのまま画面に出せる日本語であること。 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** IndexedDB が使えないときに投げる。 */
export class StorageUnavailableError extends Error {
  constructor() {
    super(
      "この端末ではデータを保存できません。プライベートブラウズを解除して開き直してください",
    );
    this.name = "StorageUnavailableError";
  }
}
```

- [ ] **Step 6: DBスキーマを作る**

`src/db/schema.ts`:

```ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { StorageUnavailableError } from "./errors";

export type Cohort = {
  id: string;
  year: number;
  className: string;
  isActive: boolean;
  createdAt: number;
};

export type StudentStatus = "active" | "transferredOut";

export type Student = {
  id: string;
  cohortId: string;
  /** 出席番号。cohort内で status に関わらず一意。 */
  attendanceNumber: number;
  /** 氏名。未入力なら空文字。 */
  name: string;
  status: StudentStatus;
  createdAt: number;
};

export type Setting = { key: string; value: unknown };

export interface HomeworkDB extends DBSchema {
  cohorts: {
    key: string;
    value: Cohort;
    indexes: { "by-year": number };
  };
  students: {
    key: string;
    value: Student;
    indexes: {
      "by-cohort": string;
      "by-cohort-number": [string, number];
    };
  };
  settings: {
    key: string;
    value: Setting;
  };
}

export const DB_NAME = "homework-tracker";
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<HomeworkDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<HomeworkDB>> {
  if (dbPromise === null) {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new StorageUnavailableError());
    }

    dbPromise = openDB<HomeworkDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const cohorts = db.createObjectStore("cohorts", { keyPath: "id" });
        cohorts.createIndex("by-year", "year");

        const students = db.createObjectStore("students", { keyPath: "id" });
        students.createIndex("by-cohort", "cohortId");
        students.createIndex("by-cohort-number", ["cohortId", "attendanceNumber"], {
          unique: true,
        });

        db.createObjectStore("settings", { keyPath: "key" });
      },
    }).catch((): never => {
      // 次の呼び出しで開き直せるようにする
      dbPromise = null;
      throw new StorageUnavailableError();
    });
  }

  return dbPromise;
}

/** テスト専用。開いている接続を閉じてキャッシュを捨てる。 */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise === null) {
    return;
  }
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}
```

- [ ] **Step 7: テスト用のDBヘルパを作る**

`src/test/db.ts`。`fake-indexeddb/auto` は `setup.ts` で読み込み済み。

```ts
import { deleteDB } from "idb";
import { beforeEach } from "vitest";
import { DB_NAME, resetDbForTests } from "../db/schema";

/** 各テストの前にDBを完全に作り直す。 */
export function useFreshDb(): void {
  beforeEach(async () => {
    await resetDbForTests();
    await deleteDB(DB_NAME);
  });
}
```

- [ ] **Step 8: IndexedDBが使えないときのテストを書いて実装を確認する**

`src/db/schema.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { StorageUnavailableError } from "./errors";
import { getDb } from "./schema";

useFreshDb();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDb", () => {
  it("IndexedDBが使えなければ復旧方法を示して失敗する", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await expect(getDb()).rejects.toThrow(StorageUnavailableError);
    await expect(getDb()).rejects.toThrow(
      "この端末ではデータを保存できません。プライベートブラウズを解除して開き直してください",
    );
  });

  it("使えるときは同じ接続を返す", async () => {
    expect(await getDb()).toBe(await getDb());
  });
});
```

Run: `npm run test:run -- src/db/schema.test.ts`
Expected: PASS（2件）。Step 6 の実装がそのまま満たす。

- [ ] **Step 9: cohortの失敗するテストを書く**

`src/db/cohorts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { ValidationError } from "./errors";
import { createCohort, getActiveCohort } from "./cohorts";

useFreshDb();

describe("createCohort", () => {
  it("作成したcohortを有効なcohortとして返す", async () => {
    const created = await createCohort({ year: 2026, className: "5年1組" });
    const active = await getActiveCohort();

    expect(active).not.toBeNull();
    expect(active?.id).toBe(created.id);
    expect(active?.year).toBe(2026);
    expect(active?.className).toBe("5年1組");
    expect(active?.isActive).toBe(true);
  });

  it("新しいcohortを作ると前のcohortは有効でなくなる", async () => {
    await createCohort({ year: 2025, className: "4年1組" });
    const second = await createCohort({ year: 2026, className: "5年1組" });

    const active = await getActiveCohort();
    expect(active?.id).toBe(second.id);
  });

  it("クラス名の前後の空白を取り除く", async () => {
    const created = await createCohort({ year: 2026, className: "  5年1組  " });
    expect(created.className).toBe("5年1組");
  });

  it("クラス名が空なら拒否する", async () => {
    await expect(createCohort({ year: 2026, className: "   " })).rejects.toThrow(
      new ValidationError("クラス名を入力してください"),
    );
  });
});

describe("getActiveCohort", () => {
  it("cohortが1つも無ければ null を返す", async () => {
    expect(await getActiveCohort()).toBeNull();
  });
});
```

- [ ] **Step 10: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/db/cohorts.test.ts`
Expected: FAIL。`Failed to resolve import "./cohorts"`

- [ ] **Step 11: cohortのデータ層を実装する**

`src/db/cohorts.ts`:

```ts
import { newId } from "../lib/id";
import { ValidationError } from "./errors";
import { getDb, type Cohort } from "./schema";

export async function createCohort(input: {
  year: number;
  className: string;
}): Promise<Cohort> {
  const className = input.className.trim();
  if (className === "") {
    throw new ValidationError("クラス名を入力してください");
  }

  const cohort: Cohort = {
    id: newId(),
    year: input.year,
    className,
    isActive: true,
    createdAt: Date.now(),
  };

  const db = await getDb();
  const tx = db.transaction("cohorts", "readwrite");

  // 有効なcohortは常に1件だけ。
  // トランザクションが閉じないよう、書き込みはまとめて発行する。
  const existing = await tx.store.getAll();
  await Promise.all(
    existing
      .filter((current) => current.isActive)
      .map((current) => tx.store.put({ ...current, isActive: false })),
  );
  await tx.store.put(cohort);
  await tx.done;

  return cohort;
}

export async function getActiveCohort(): Promise<Cohort | null> {
  const db = await getDb();
  const all = await db.getAll("cohorts");
  return all.find((cohort) => cohort.isActive) ?? null;
}
```

- [ ] **Step 12: テストを実行して成功を確認する**

Run: `npm run test:run -- src/db/cohorts.test.ts`
Expected: PASS（5件）

- [ ] **Step 13: 設定の失敗するテストを書く**

`src/db/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { getSetting, setSetting } from "./settings";

useFreshDb();

describe("getSetting", () => {
  it("未設定なら showStudentNames は false", async () => {
    expect(await getSetting("showStudentNames")).toBe(false);
  });

  it("未設定なら rosterHintDismissed は false", async () => {
    expect(await getSetting("rosterHintDismissed")).toBe(false);
  });
});

describe("setSetting", () => {
  it("保存した値を読み戻せる", async () => {
    await setSetting("showStudentNames", true);
    expect(await getSetting("showStudentNames")).toBe(true);
  });

  it("false に戻せる", async () => {
    await setSetting("showStudentNames", true);
    await setSetting("showStudentNames", false);
    expect(await getSetting("showStudentNames")).toBe(false);
  });

  it("キーごとに独立している", async () => {
    await setSetting("showStudentNames", true);
    expect(await getSetting("rosterHintDismissed")).toBe(false);
  });
});
```

- [ ] **Step 14: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/db/settings.test.ts`
Expected: FAIL。`Failed to resolve import "./settings"`

- [ ] **Step 15: 設定のデータ層を実装する**

`src/db/settings.ts`:

```ts
import { getDb } from "./schema";

export const SETTING_DEFAULTS = {
  /** 名簿と印刷シートに氏名を表示するか */
  showStudentNames: false,
  /** 名簿画面の初回案内を閉じたか */
  rosterHintDismissed: false,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(key: SettingKey): Promise<boolean> {
  const db = await getDb();
  const row = await db.get("settings", key);
  return row === undefined ? SETTING_DEFAULTS[key] : row.value === true;
}

export async function setSetting(key: SettingKey, value: boolean): Promise<void> {
  const db = await getDb();
  await db.put("settings", { key, value });
}
```

- [ ] **Step 16: テストを実行して成功を確認する**

Run: `npm run test:run -- src/db/settings.test.ts`
Expected: PASS（5件）

- [ ] **Step 17: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 全テストPASS、型エラーなし。

- [ ] **Step 18: コミット**

```bash
git add -A
git commit -m "feat: IndexedDBのスキーマとcohort・設定のデータ層を追加"
```

---

### Task 3: 生徒のデータ層

出席番号の自動採番、重複検証、転出・復帰・物理削除を作る。このタスクが名簿機能の心臓部になる。

**Files:**
- Create: `src/db/students.ts`
- Test: `src/db/students.test.ts`

**Interfaces:**
- Consumes: `getDb`, `Student`, `StudentStatus`（`./schema`）/ `ValidationError`（`./errors`）/ `newId`（`../lib/id`）/ `createCohort`（`./cohorts`、テストで使用）
- Produces:
  - `listStudents(cohortId: string): Promise<Student[]>` — 出席番号の昇順
  - `getStudent(id: string): Promise<Student | null>`
  - `nextAttendanceNumber(cohortId: string): Promise<number>`
  - `addStudent(input: { cohortId: string; attendanceNumber: number; name?: string }): Promise<Student>`
  - `updateStudent(id: string, changes: { attendanceNumber: number; name: string }): Promise<Student>`
  - `transferOutStudent(id: string): Promise<Student>`
  - `restoreStudent(id: string): Promise<Student>`
  - `deleteStudent(id: string): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`src/db/students.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { ValidationError } from "./errors";
import {
  addStudent,
  deleteStudent,
  getStudent,
  listStudents,
  nextAttendanceNumber,
  restoreStudent,
  transferOutStudent,
  updateStudent,
} from "./students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

describe("nextAttendanceNumber", () => {
  it("生徒が居なければ 1", async () => {
    expect(await nextAttendanceNumber(cohortId)).toBe(1);
  });

  it("最大の出席番号の次を返す", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 5 });
    expect(await nextAttendanceNumber(cohortId)).toBe(6);
  });

  it("転出した生徒の番号も最大値の計算に含める", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 34 });
    await transferOutStudent(student.id);
    expect(await nextAttendanceNumber(cohortId)).toBe(35);
  });
});

describe("addStudent", () => {
  it("在籍として登録し氏名は空文字で始まる", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    expect(student.status).toBe("active");
    expect(student.name).toBe("");
    expect(student.attendanceNumber).toBe(1);
  });

  it("氏名の前後の空白を取り除く", async () => {
    const student = await addStudent({
      cohortId,
      attendanceNumber: 1,
      name: "  やまだ  ",
    });
    expect(student.name).toBe("やまだ");
  });

  it("在籍中の生徒と番号が重なれば拒否する", async () => {
    await addStudent({ cohortId, attendanceNumber: 12 });
    await expect(
      addStudent({ cohortId, attendanceNumber: 12 }),
    ).rejects.toThrow(new ValidationError("出席番号12はすでに使われています"));
  });

  it("転出した生徒の欠番と重なれば理由を示して拒否する", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await transferOutStudent(student.id);
    await expect(
      addStudent({ cohortId, attendanceNumber: 12 }),
    ).rejects.toThrow(new ValidationError("12番は転出した生徒の欠番です"));
  });

  it("0以下の番号を拒否する", async () => {
    await expect(addStudent({ cohortId, attendanceNumber: 0 })).rejects.toThrow(
      new ValidationError("出席番号は1以上の数字で入力してください"),
    );
  });

  it("整数でない番号を拒否する", async () => {
    await expect(
      addStudent({ cohortId, attendanceNumber: 1.5 }),
    ).rejects.toThrow(
      new ValidationError("出席番号は1以上の数字で入力してください"),
    );
  });

  it("別のcohortとは番号が重なってもよい", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addStudent({ cohortId: other.id, attendanceNumber: 1 });
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    expect(student.attendanceNumber).toBe(1);
  });
});

describe("listStudents", () => {
  it("出席番号の昇順で返す", async () => {
    await addStudent({ cohortId, attendanceNumber: 3 });
    await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 2 });

    const numbers = (await listStudents(cohortId)).map((s) => s.attendanceNumber);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it("転出した生徒も含めて返す", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    await transferOutStudent(student.id);
    expect(await listStudents(cohortId)).toHaveLength(1);
  });

  it("他のcohortの生徒を含めない", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addStudent({ cohortId: other.id, attendanceNumber: 1 });
    expect(await listStudents(cohortId)).toHaveLength(0);
  });
});

describe("updateStudent", () => {
  it("出席番号と氏名を変更できる", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    const updated = await updateStudent(student.id, {
      attendanceNumber: 7,
      name: "やまだ",
    });

    expect(updated.attendanceNumber).toBe(7);
    expect(updated.name).toBe("やまだ");
  });

  it("内部IDは変わらない", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    const updated = await updateStudent(student.id, {
      attendanceNumber: 7,
      name: "",
    });
    expect(updated.id).toBe(student.id);
  });

  it("自分自身の番号のままなら通す", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    const updated = await updateStudent(student.id, {
      attendanceNumber: 1,
      name: "やまだ",
    });
    expect(updated.attendanceNumber).toBe(1);
  });

  it("他の生徒の番号と重なれば拒否する", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    const second = await addStudent({ cohortId, attendanceNumber: 2 });

    await expect(
      updateStudent(second.id, { attendanceNumber: 1, name: "" }),
    ).rejects.toThrow(new ValidationError("出席番号1はすでに使われています"));
  });
});

describe("transferOutStudent と restoreStudent", () => {
  it("転出しても番号は欠番として残る", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    const out = await transferOutStudent(student.id);

    expect(out.status).toBe("transferredOut");
    expect(out.attendanceNumber).toBe(12);
    await expect(
      addStudent({ cohortId, attendanceNumber: 12 }),
    ).rejects.toThrow(ValidationError);
  });

  it("在籍に戻せる", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await transferOutStudent(student.id);
    const restored = await restoreStudent(student.id);
    expect(restored.status).toBe("active");
  });
});

describe("deleteStudent", () => {
  it("削除すると一覧から消える", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    await deleteStudent(student.id);

    expect(await getStudent(student.id)).toBeNull();
    expect(await listStudents(cohortId)).toHaveLength(0);
  });

  it("削除した番号は再利用できる", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await deleteStudent(student.id);

    const reused = await addStudent({ cohortId, attendanceNumber: 12 });
    expect(reused.attendanceNumber).toBe(12);
    expect(reused.id).not.toBe(student.id);
  });
});

describe("存在しない生徒の操作", () => {
  it("getStudent は null を返す", async () => {
    expect(await getStudent("missing")).toBeNull();
  });

  it("updateStudent は拒否する", async () => {
    await expect(
      updateStudent("missing", { attendanceNumber: 1, name: "" }),
    ).rejects.toThrow(new ValidationError("この生徒は見つかりません"));
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/db/students.test.ts`
Expected: FAIL。`Failed to resolve import "./students"`

- [ ] **Step 3: 生徒のデータ層を実装する**

`src/db/students.ts`:

```ts
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

  const student: Student = {
    id: newId(),
    cohortId: input.cohortId,
    attendanceNumber: input.attendanceNumber,
    name: (input.name ?? "").trim(),
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
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm run test:run -- src/db/students.test.ts`
Expected: PASS（23件）

- [ ] **Step 5: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 全テストPASS、型エラーなし。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat: 生徒のデータ層（採番・重複検証・転出・削除）を追加"
```

---

### Task 4: QRコードのペイロードと生成

**Files:**
- Create: `src/lib/qr.ts`
- Test: `src/lib/qr.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `QR_PAYLOAD_PREFIX: "hw1:"`
  - `buildQrPayload(studentId: string): string`
  - `renderQrSvg(payload: string): Promise<string>` — `<svg>` から始まる文字列を返す

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/qr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildQrPayload, renderQrSvg, QR_PAYLOAD_PREFIX } from "./qr";

const STUDENT_ID = "9f2c1a84-4d3e-4c1b-8f77-2b6c9a0e51d3";

describe("buildQrPayload", () => {
  it("接頭辞と内部IDを繋げた文字列を返す", () => {
    expect(buildQrPayload(STUDENT_ID)).toBe(`hw1:${STUDENT_ID}`);
  });

  it("接頭辞は hw1: である", () => {
    expect(QR_PAYLOAD_PREFIX).toBe("hw1:");
  });

  it("出席番号を含まないので、番号を変えてもペイロードは変わらない", () => {
    // ペイロードは内部IDだけから決まる
    expect(buildQrPayload(STUDENT_ID)).toBe(buildQrPayload(STUDENT_ID));
    expect(buildQrPayload(STUDENT_ID)).not.toContain("番");
  });
});

describe("renderQrSvg", () => {
  it("SVG文字列を返す", async () => {
    const svg = await renderQrSvg(buildQrPayload(STUDENT_ID));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
  });

  it("同じペイロードからは同じSVGが出る", async () => {
    const payload = buildQrPayload(STUDENT_ID);
    expect(await renderQrSvg(payload)).toBe(await renderQrSvg(payload));
  });

  it("違うペイロードからは違うSVGが出る", async () => {
    const a = await renderQrSvg(buildQrPayload(STUDENT_ID));
    const b = await renderQrSvg(buildQrPayload("00000000-0000-4000-8000-000000000000"));
    expect(a).not.toBe(b);
  });

  it("空文字は拒否する", async () => {
    await expect(renderQrSvg("")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/lib/qr.test.ts`
Expected: FAIL。`Failed to resolve import "./qr"`

- [ ] **Step 3: 実装する**

`src/lib/qr.ts`。誤り訂正はQ（25%）。ラミネートしたカードは反射と傷で読み取り率が落ちるため、既定のMでは足りない。`margin: 4` は QR の規格が要求する静穏帯（クワイエットゾーン）で、これを削ると読み取りに失敗しやすくなる。

```ts
import QRCode from "qrcode";

/** スキャナが無関係なQRコードを弾くための接頭辞。1 はペイロード形式のバージョン。 */
export const QR_PAYLOAD_PREFIX = "hw1:";

/** QRに埋め込む文字列。出席番号ではなく不変の内部IDを使う。 */
export function buildQrPayload(studentId: string): string {
  return `${QR_PAYLOAD_PREFIX}${studentId}`;
}

export function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 4,
  });
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm run test:run -- src/lib/qr.test.ts`
Expected: PASS（7件）

- [ ] **Step 5: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 全テストPASS、型エラーなし。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat: QRペイロードの組み立てとSVG生成を追加"
```

---

### Task 5: ルーティング、cohortガード、初回セットアップ画面

アプリの骨格。cohortが無ければ必ず `/setup` に送る。

**Files:**
- Create: `src/hooks/useAsync.ts`
- Create: `src/components/FullScreenMessage.tsx`
- Create: `src/components/CohortGate.tsx`
- Create: `src/screens/Setup.tsx`
- Modify: `src/App.tsx`（Task 1 の仮画面を全面的に差し替える）
- Modify: `src/main.tsx`（`BrowserRouter` で包む）
- Test: `src/screens/Setup.test.tsx`

**Interfaces:**
- Consumes: `currentSchoolYear`（`../lib/schoolYear`）/ `createCohort`, `getActiveCohort`（`../db/cohorts`）/ `ValidationError`（`../db/errors`）/ `Cohort`（`../db/schema`）
- Produces:
  - `type AsyncState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string }`
  - `useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void }`
  - `<FullScreenMessage tone?: "normal" | "error">{children}</FullScreenMessage>`
  - `<CohortGate>{children}</CohortGate>` — cohortが無ければ `/setup` へリダイレクト
  - `useActiveCohort(): Cohort` — `CohortGate` の中でのみ使える
  - `<AppRoutes />` — `<Routes>` のみ。テストは `MemoryRouter` で包む
  - `<App />` — `BrowserRouter` + `AppRoutes`

- [ ] **Step 1: 非同期読み込みフックを作る**

`src/hooks/useAsync.ts`。すべての画面がこの1つの形でデータを読む。

```ts
import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

export function useAsync<T>(
  load: () => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    load()
      .then((data) => {
        if (!cancelled) {
          setState({ status: "ready", data });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "データを読み込めませんでした。画面を開き直してください",
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // load は毎レンダーで新しい関数になるため deps で制御する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload };
}
```

- [ ] **Step 2: 全画面メッセージを作る**

`src/components/FullScreenMessage.tsx`:

```tsx
import type { ReactNode } from "react";

export function FullScreenMessage({
  children,
  tone = "normal",
}: {
  children: ReactNode;
  tone?: "normal" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="flex min-h-dvh items-center justify-center p-6"
    >
      <p
        className={`max-w-sm text-center ${
          tone === "error" ? "text-sumi font-bold" : "text-ai"
        }`}
      >
        {children}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: cohortガードを作る**

`src/components/CohortGate.tsx`:

```tsx
import { createContext, use, type ReactNode } from "react";
import { Navigate } from "react-router";
import { getActiveCohort } from "../db/cohorts";
import type { Cohort } from "../db/schema";
import { useAsync } from "../hooks/useAsync";
import { FullScreenMessage } from "./FullScreenMessage";

const CohortContext = createContext<Cohort | null>(null);

/** CohortGate の内側でのみ使える。有効なcohortを返す。 */
export function useActiveCohort(): Cohort {
  const cohort = use(CohortContext);
  if (cohort === null) {
    throw new Error("useActiveCohort は CohortGate の中でのみ使えます");
  }
  return cohort;
}

export function CohortGate({ children }: { children: ReactNode }) {
  const state = useAsync(() => getActiveCohort(), []);

  if (state.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (state.status === "error") {
    return <FullScreenMessage tone="error">{state.message}</FullScreenMessage>;
  }
  if (state.data === null) {
    return <Navigate to="/setup" replace />;
  }

  return <CohortContext value={state.data}>{children}</CohortContext>;
}
```

- [ ] **Step 4: 初回セットアップ画面の失敗するテストを書く**

`src/screens/Setup.test.tsx`:

```tsx
import { useFreshDb } from "../test/db";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { getActiveCohort } from "../db/cohorts";

useFreshDb();

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("初回セットアップ", () => {
  it("cohortが無いとき名簿を開くとセットアップに送られる", async () => {
    renderAt("/roster");
    expect(
      await screen.findByRole("heading", { name: "クラスをつくる" }),
    ).toBeInTheDocument();
  });

  it("年度の初期値が現在の学校年度になっている", async () => {
    renderAt("/setup");
    const year = await screen.findByLabelText("年度");
    expect(year).toHaveValue(2026);
  });

  it("クラス名が空なら保存せずエラーを出す", async () => {
    const user = userEvent.setup();
    renderAt("/setup");

    await user.click(await screen.findByRole("button", { name: "クラスをつくる" }));

    expect(await screen.findByText("クラス名を入力してください")).toBeInTheDocument();
    expect(await getActiveCohort()).toBeNull();
  });

  it("入力して保存するとcohortが作られ名簿に移る", async () => {
    const user = userEvent.setup();
    renderAt("/setup");

    await user.type(await screen.findByLabelText("クラス名"), "5年1組");
    await user.click(screen.getByRole("button", { name: "クラスをつくる" }));

    expect(await screen.findByText("2026年度 5年1組")).toBeInTheDocument();

    const cohort = await getActiveCohort();
    expect(cohort?.className).toBe("5年1組");
    expect(cohort?.year).toBe(2026);
  });
});
```

**注意:** 3つ目・4つ目のテストは `currentSchoolYear()` が 2026 を返す前提。計画作成時点（2026年8月）ではそうなる。2027年4月以降に実行する場合は期待値をその年度に読み替えること。

- [ ] **Step 5: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/screens/Setup.test.tsx`
Expected: FAIL。`AppRoutes` が `../App` に無い。

- [ ] **Step 6: セットアップ画面を実装する**

`src/screens/Setup.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { createCohort } from "../db/cohorts";
import { currentSchoolYear } from "../lib/schoolYear";

export function Setup() {
  const navigate = useNavigate();
  const [year, setYear] = useState(currentSchoolYear());
  const [className, setClassName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await createCohort({ year, className });
      navigate("/roster", { replace: true });
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "クラスを作れませんでした。もう一度お試しください",
      );
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="font-display text-ai text-3xl">クラスをつくる</h1>
      <p className="mt-2 text-sm">
        はじめに、この端末で使うクラスを登録します。
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">年度</span>
          <input
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="border-ai font-num rounded border-2 px-3 py-2 text-xl"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">クラス名</span>
          <input
            type="text"
            value={className}
            placeholder="5年1組"
            onChange={(event) => setClassName(event.target.value)}
            className="border-ai rounded border-2 px-3 py-2 text-xl"
          />
        </label>

        {error !== null && (
          <p role="alert" className="text-sm font-bold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-ai rounded px-4 py-3 font-bold text-white disabled:opacity-50"
        >
          クラスをつくる
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: ルーティングを組む**

`src/App.tsx`（Task 1 の内容を全面的に置き換える）。この時点では `/roster` に暫定のプレースホルダを置き、Task 6 で本物に差し替える。

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { CohortGate, useActiveCohort } from "./components/CohortGate";
import { Setup } from "./screens/Setup";

/** Task 6 で本物の名簿画面に差し替える。 */
function RosterPlaceholder() {
  const cohort = useActiveCohort();
  return (
    <main className="p-6">
      <h1 className="font-display text-ai text-2xl">
        {cohort.year}年度 {cohort.className}
      </h1>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route
        path="/roster"
        element={
          <CohortGate>
            <RosterPlaceholder />
          </CohortGate>
        }
      />
      <Route path="*" element={<Navigate to="/roster" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

`src/main.tsx` は変更不要（`App` をそのまま描画している）。

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `npm run test:run -- src/screens/Setup.test.tsx`
Expected: PASS（4件）

- [ ] **Step 9: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 全テストPASS、型エラーなし。

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "feat: ルーティング、cohortガード、初回セットアップ画面を追加"
```

---

### Task 6: 生徒名簿画面

主画面。出席番号のグリッドだけで在籍と欠番を伝える。

**Files:**
- Create: `src/hooks/useStudents.ts`
- Create: `src/hooks/useSetting.ts`
- Create: `src/components/AppHeader.tsx`
- Create: `src/components/StudentCell.tsx`
- Create: `src/components/RosterGrid.tsx`
- Create: `src/screens/Roster.tsx`
- Modify: `src/App.tsx`（`RosterPlaceholder` を削除して `Roster` を使う）
- Test: `src/screens/Roster.test.tsx`

**Interfaces:**
- Consumes: `useAsync`（`../hooks/useAsync`）/ `useActiveCohort`, `CohortGate`（`../components/CohortGate`）/ `listStudents`（`../db/students`）/ `getSetting`, `setSetting`, `SettingKey`（`../db/settings`）/ `Student`（`../db/schema`）/ `FullScreenMessage`
- Produces:
  - `useStudents(cohortId: string): AsyncState<Student[]> & { reload: () => void }`
  - `useSetting(key: SettingKey): { value: boolean; loading: boolean; update: (next: boolean) => Promise<void> }`
  - `<AppHeader cohort={cohort} subtitle={string} />`
  - `<StudentCell student={student} showName={boolean} />` — `data-status` 属性に `active` / `transferredOut` を出す
  - `<RosterGrid students={Student[]} showName={boolean} />`
  - `<Roster />`

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/Roster.test.tsx`:

```tsx
import { useFreshDb } from "../test/db";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { getSetting, setSetting } from "../db/settings";
import { addStudent, transferOutStudent } from "../db/students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderRoster() {
  return render(
    <MemoryRouter initialEntries={["/roster"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("名簿のヘッダー", () => {
  it("年度とクラス名を表示する", async () => {
    renderRoster();
    expect(await screen.findByText("2026年度 5年1組")).toBeInTheDocument();
  });

  it("在籍と欠番の人数を表示する", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 2 });
    const out = await addStudent({ cohortId, attendanceNumber: 3 });
    await transferOutStudent(out.id);

    renderRoster();
    expect(await screen.findByText("在籍2人・欠番1")).toBeInTheDocument();
  });
});

describe("名簿のグリッド", () => {
  it("在籍と欠番を描き分ける", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    const out = await addStudent({ cohortId, attendanceNumber: 2 });
    await transferOutStudent(out.id);

    renderRoster();

    const cells = await screen.findAllByTestId("student-cell");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveAttribute("data-status", "active");
    expect(cells[1]).toHaveAttribute("data-status", "transferredOut");
  });

  it("出席番号の昇順に並べる", async () => {
    await addStudent({ cohortId, attendanceNumber: 3 });
    await addStudent({ cohortId, attendanceNumber: 1 });

    renderRoster();

    const cells = await screen.findAllByTestId("student-cell");
    expect(within(cells[0]).getByText("1")).toBeInTheDocument();
    expect(within(cells[1]).getByText("3")).toBeInTheDocument();
  });

  it("セルは編集画面へのリンクになっている", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    renderRoster();

    const cell = await screen.findByRole("link", { name: /1番/ });
    expect(cell).toHaveAttribute("href", `/roster/${student.id}/edit`);
  });
});

describe("氏名の表示設定", () => {
  it("設定がOFFなら氏名を出さない", async () => {
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });
    renderRoster();

    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(screen.queryByText("やまだ")).not.toBeInTheDocument();
  });

  it("設定がONなら氏名を出す", async () => {
    await setSetting("showStudentNames", true);
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });
    renderRoster();

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });
});

describe("生徒が居ないとき", () => {
  it("空状態の案内を出しグリッドは描かない", async () => {
    renderRoster();

    expect(
      await screen.findByText("まず出席番号を追加してください"),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("student-cell")).toHaveLength(0);
  });

  it("初回案内は出さない", async () => {
    renderRoster();
    await screen.findByText("まず出席番号を追加してください");
    expect(
      screen.queryByText("番号をタップすると編集できます"),
    ).not.toBeInTheDocument();
  });
});

describe("初回案内", () => {
  it("生徒が居て未読なら表示する", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    renderRoster();

    expect(
      await screen.findByText("番号をタップすると編集できます"),
    ).toBeInTheDocument();
  });

  it("閉じると消えて設定に記録される", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1 });
    renderRoster();

    await user.click(await screen.findByRole("button", { name: "閉じる" }));

    expect(
      screen.queryByText("番号をタップすると編集できます"),
    ).not.toBeInTheDocument();
    expect(await getSetting("rosterHintDismissed")).toBe(true);
  });

  it("既読なら表示しない", async () => {
    await setSetting("rosterHintDismissed", true);
    await addStudent({ cohortId, attendanceNumber: 1 });
    renderRoster();

    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(
      screen.queryByText("番号をタップすると編集できます"),
    ).not.toBeInTheDocument();
  });
});

describe("下部のボタン", () => {
  it("追加と印刷への導線がある", async () => {
    renderRoster();

    expect(
      await screen.findByRole("link", { name: "生徒を追加" }),
    ).toHaveAttribute("href", "/roster/new");
    expect(screen.getByRole("link", { name: "QRを印刷" })).toHaveAttribute(
      "href",
      "/print",
    );
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/screens/Roster.test.tsx`
Expected: FAIL。名簿画面がまだプレースホルダのため、ヘッダー以外のほぼ全件が落ちる。

- [ ] **Step 3: 生徒一覧フックを作る**

`src/hooks/useStudents.ts`:

```ts
import type { Student } from "../db/schema";
import { listStudents } from "../db/students";
import { useAsync, type AsyncState } from "./useAsync";

export function useStudents(
  cohortId: string,
): AsyncState<Student[]> & { reload: () => void } {
  return useAsync(() => listStudents(cohortId), [cohortId]);
}
```

- [ ] **Step 4: 設定フックを作る**

`src/hooks/useSetting.ts`。読み込み中は既定値を返し、画面がちらつかないようにする。

```ts
import { useCallback, useEffect, useState } from "react";
import {
  getSetting,
  setSetting,
  SETTING_DEFAULTS,
  type SettingKey,
} from "../db/settings";

export function useSetting(key: SettingKey): {
  value: boolean;
  loading: boolean;
  update: (next: boolean) => Promise<void>;
} {
  const [value, setValue] = useState<boolean>(SETTING_DEFAULTS[key]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getSetting(key)
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
  }, [key]);

  const update = useCallback(
    async (next: boolean) => {
      setValue(next);
      await setSetting(key, next);
    },
    [key],
  );

  return { value, loading, update };
}
```

- [ ] **Step 5: ヘッダーを作る**

`src/components/AppHeader.tsx`。歯車のリンクは Task 9 で足す。

```tsx
import type { Cohort } from "../db/schema";

export function AppHeader({
  cohort,
  subtitle,
}: {
  cohort: Cohort;
  subtitle: string;
}) {
  return (
    <header className="border-kogan border-b pb-3">
      <h1 className="font-display text-ai text-2xl">
        {cohort.year}年度 {cohort.className}
      </h1>
      <p className="mt-1 text-sm">{subtitle}</p>
    </header>
  );
}
```

- [ ] **Step 6: セルとグリッドを作る**

`src/components/StudentCell.tsx`:

```tsx
import { Link } from "react-router";
import type { Student } from "../db/schema";

export function StudentCell({
  student,
  showName,
}: {
  student: Student;
  showName: boolean;
}) {
  const transferredOut = student.status === "transferredOut";
  const label = transferredOut
    ? `${student.attendanceNumber}番（転出）`
    : `${student.attendanceNumber}番`;

  return (
    <Link
      to={`/roster/${student.id}/edit`}
      data-testid="student-cell"
      data-status={student.status}
      aria-label={label}
      className={[
        "flex aspect-square min-h-16 flex-col items-center justify-center rounded",
        transferredOut
          ? "border-kogan text-kogan hatch border-2 border-dashed"
          : "border-ai text-sumi border-2",
      ].join(" ")}
    >
      <span className="font-num text-3xl leading-none font-bold">
        {student.attendanceNumber}
      </span>
      {showName && student.name !== "" && (
        <span className="mt-1 max-w-full truncate px-1 text-[10px]">
          {student.name}
        </span>
      )}
    </Link>
  );
}
```

`src/components/RosterGrid.tsx`:

```tsx
import type { Student } from "../db/schema";
import { StudentCell } from "./StudentCell";

export function RosterGrid({
  students,
  showName,
}: {
  students: Student[];
  showName: boolean;
}) {
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
      {students.map((student) => (
        <li key={student.id}>
          <StudentCell student={student} showName={showName} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 7: 名簿画面を作る**

`src/screens/Roster.tsx`:

```tsx
import { Link } from "react-router";
import { AppHeader } from "../components/AppHeader";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { RosterGrid } from "../components/RosterGrid";
import { useSetting } from "../hooks/useSetting";
import { useStudents } from "../hooks/useStudents";

function RosterBody() {
  const cohort = useActiveCohort();
  const students = useStudents(cohort.id);
  const showNames = useSetting("showStudentNames");
  const hint = useSetting("rosterHintDismissed");

  if (students.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (students.status === "error") {
    return <FullScreenMessage tone="error">{students.message}</FullScreenMessage>;
  }

  const list = students.data;
  const activeCount = list.filter((s) => s.status === "active").length;
  const missingCount = list.length - activeCount;
  const showHint = list.length > 0 && !hint.loading && !hint.value;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <AppHeader
        cohort={cohort}
        subtitle={`在籍${activeCount}人・欠番${missingCount}`}
      />

      {showHint && (
        <div className="border-kogan flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
          <span>番号をタップすると編集できます</span>
          <button
            type="button"
            onClick={() => void hint.update(true)}
            className="text-ai shrink-0 font-bold underline"
          >
            閉じる
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-ai py-12 text-center">まず出席番号を追加してください</p>
      ) : (
        <RosterGrid students={list} showName={showNames.value} />
      )}

      <nav className="mt-auto flex gap-3 pt-4">
        <Link
          to="/roster/new"
          className="bg-ai flex-1 rounded px-4 py-3 text-center font-bold text-white"
        >
          生徒を追加
        </Link>
        <Link
          to="/print"
          className="border-ai text-ai flex-1 rounded border-2 px-4 py-3 text-center font-bold"
        >
          QRを印刷
        </Link>
      </nav>
    </main>
  );
}

export function Roster() {
  return (
    <CohortGate>
      <RosterBody />
    </CohortGate>
  );
}
```

- [ ] **Step 8: ルーティングを差し替える**

`src/App.tsx` から `RosterPlaceholder` を削除し、`Roster` を使う。`CohortGate` は `Roster` の中に移ったので、ルート側では包まない。

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Roster } from "./screens/Roster";
import { Setup } from "./screens/Setup";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/roster" element={<Roster />} />
      <Route path="*" element={<Navigate to="/roster" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

- [ ] **Step 9: テストを実行して成功を確認する**

Run: `npm run test:run -- src/screens/Roster.test.tsx`
Expected: PASS（13件）

- [ ] **Step 10: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 全テストPASS、型エラーなし。Setup のテストも引き続き通ること。

- [ ] **Step 11: 375px幅で目視確認する**

この時点では登録画面がまだ無いため、ブラウザのコンソールから直接データを入れて確認する。

Run: `npm run dev`

`/setup` でクラスを作った後、開発者ツールのコンソールで次を実行する。

```js
const { getActiveCohort } = await import("/src/db/cohorts.ts");
const { addStudent } = await import("/src/db/students.ts");
const cohort = await getActiveCohort();
for (let n = 1; n <= 34; n += 1) {
  await addStudent({ cohortId: cohort.id, attendanceNumber: n });
}
location.reload();
```

幅375pxで、グリッドが4列に並び横スクロールが出ないこと、番号が腕を伸ばした距離から読めることを確認する。

- [ ] **Step 12: コミット**

```bash
git add -A
git commit -m "feat: 生徒名簿画面（グリッド・空状態・初回案内）を追加"
```

---

### Task 7: 生徒の追加・編集画面

**Files:**
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/components/StudentForm.tsx`
- Create: `src/screens/StudentNew.tsx`
- Create: `src/screens/StudentEdit.tsx`
- Modify: `src/App.tsx`（`/roster/new` と `/roster/:id/edit` を足す）
- Test: `src/screens/StudentNew.test.tsx`
- Test: `src/screens/StudentEdit.test.tsx`

**Interfaces:**
- Consumes: `addStudent`, `updateStudent`, `getStudent`, `nextAttendanceNumber`, `transferOutStudent`, `restoreStudent`, `deleteStudent`（`../db/students`）/ `useActiveCohort`, `CohortGate` / `useAsync` / `useSetting` / `AppHeader` / `FullScreenMessage`
- Produces:
  - `<ConfirmDialog title message confirmLabel tone onConfirm onCancel />` — `tone` は `"normal" | "danger"`。`danger` のときだけ朱を使う
  - `<StudentForm defaultNumber defaultName showName error submitting primaryLabel secondaryLabel? onSubmit onSecondary? />`
  - `<StudentNew />` / `<StudentEdit />`

- [ ] **Step 1: 追加画面の失敗するテストを書く**

`src/screens/StudentNew.test.tsx`:

```tsx
import { useFreshDb } from "../test/db";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { setSetting } from "../db/settings";
import { addStudent, listStudents, transferOutStudent } from "../db/students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderNew() {
  return render(
    <MemoryRouter initialEntries={["/roster/new"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("出席番号の初期値", () => {
  it("生徒が居なければ1", async () => {
    renderNew();
    expect(await screen.findByLabelText("出席番号")).toHaveValue(1);
  });

  it("最大の番号の次になる", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 8 });

    renderNew();
    expect(await screen.findByLabelText("出席番号")).toHaveValue(9);
  });

  it("転出した生徒の番号も数える", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 34 });
    await transferOutStudent(student.id);

    renderNew();
    expect(await screen.findByLabelText("出席番号")).toHaveValue(35);
  });
});

describe("保存", () => {
  it("保存すると名簿に戻り生徒が増える", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.click(await screen.findByRole("button", { name: "保存する" }));

    expect(await screen.findByText("在籍1人・欠番0")).toBeInTheDocument();
    expect(await listStudents(cohortId)).toHaveLength(1);
  });

  it("続けて追加すると画面に留まり番号が次に進む", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.click(
      await screen.findByRole("button", { name: "保存して続けて追加" }),
    );

    expect(await screen.findByLabelText("出席番号")).toHaveValue(2);
    expect(await listStudents(cohortId)).toHaveLength(1);
  });
});

describe("入力の検証", () => {
  it("在籍中の番号と重なればエラーを出し保存しない", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 12 });
    renderNew();

    const numberField = await screen.findByLabelText("出席番号");
    await user.clear(numberField);
    await user.type(numberField, "12");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("出席番号12はすでに使われています"),
    ).toBeInTheDocument();
    expect(await listStudents(cohortId)).toHaveLength(1);
  });

  it("転出した生徒の欠番と重なれば理由を示す", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await transferOutStudent(student.id);
    renderNew();

    const numberField = await screen.findByLabelText("出席番号");
    await user.clear(numberField);
    await user.type(numberField, "12");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("12番は転出した生徒の欠番です"),
    ).toBeInTheDocument();
  });

  it("0以下ならエラーを出す", async () => {
    const user = userEvent.setup();
    renderNew();

    const numberField = await screen.findByLabelText("出席番号");
    await user.clear(numberField);
    await user.type(numberField, "0");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("出席番号は1以上の数字で入力してください"),
    ).toBeInTheDocument();
  });
});

describe("氏名欄", () => {
  it("設定がOFFなら出さない", async () => {
    renderNew();
    await screen.findByLabelText("出席番号");
    expect(screen.queryByLabelText("氏名")).not.toBeInTheDocument();
  });

  it("設定がONなら出して保存できる", async () => {
    const user = userEvent.setup();
    await setSetting("showStudentNames", true);
    renderNew();

    await user.type(await screen.findByLabelText("氏名"), "やまだ");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("在籍1人・欠番0");
    const students = await listStudents(cohortId);
    expect(students[0].name).toBe("やまだ");
  });
});
```

- [ ] **Step 2: 編集画面の失敗するテストを書く**

`src/screens/StudentEdit.test.tsx`:

```tsx
import { useFreshDb } from "../test/db";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { setSetting } from "../db/settings";
import {
  addStudent,
  getStudent,
  listStudents,
  transferOutStudent,
} from "../db/students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderEdit(studentId: string) {
  return render(
    <MemoryRouter initialEntries={[`/roster/${studentId}/edit`]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("読み込み", () => {
  it("いまの出席番号を表示する", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    expect(await screen.findByLabelText("出席番号")).toHaveValue(12);
  });

  it("居ない生徒なら見つからないと伝える", async () => {
    renderEdit("missing");
    expect(await screen.findByText("この生徒は見つかりません")).toBeInTheDocument();
  });
});

describe("保存", () => {
  it("出席番号を変えられる", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    const numberField = await screen.findByLabelText("出席番号");
    await user.clear(numberField);
    await user.type(numberField, "7");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("在籍1人・欠番0");
    expect((await getStudent(student.id))?.attendanceNumber).toBe(7);
  });

  it("他の生徒の番号と重なれば拒否する", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1 });
    const second = await addStudent({ cohortId, attendanceNumber: 2 });
    renderEdit(second.id);

    const numberField = await screen.findByLabelText("出席番号");
    await user.clear(numberField);
    await user.type(numberField, "1");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("出席番号1はすでに使われています"),
    ).toBeInTheDocument();
    expect((await getStudent(second.id))?.attendanceNumber).toBe(2);
  });

  it("氏名の設定がONなら氏名を変えられる", async () => {
    const user = userEvent.setup();
    await setSetting("showStudentNames", true);
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    renderEdit(student.id);

    await user.type(await screen.findByLabelText("氏名"), "やまだ");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("在籍1人・欠番0");
    expect((await getStudent(student.id))?.name).toBe("やまだ");
  });
});

describe("転出", () => {
  it("確認してから転出し番号は欠番として残る", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "転出にする" }));

    // 「転出にする」は画面とダイアログの両方にあるためダイアログ内に絞る
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "転出にする" }));

    await screen.findByText("在籍0人・欠番1");
    const updated = await getStudent(student.id);
    expect(updated?.status).toBe("transferredOut");
    expect(updated?.attendanceNumber).toBe(12);
  });

  it("確認を取り消せば何も起きない", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "転出にする" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect((await getStudent(student.id))?.status).toBe("active");
  });

  it("転出済みなら在籍に戻せる", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await transferOutStudent(student.id);
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "在籍に戻す" }));

    await screen.findByText("在籍1人・欠番0");
    expect((await getStudent(student.id))?.status).toBe("active");
  });
});

describe("完全に削除", () => {
  it("確認したうえで削除し番号が空く", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "完全に削除" }));
    expect(
      await screen.findByText("この生徒の記録は元に戻せません"),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    await screen.findByText("まず出席番号を追加してください");
    expect(await listStudents(cohortId)).toHaveLength(0);
  });

  it("確認を取り消せば消えない", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "完全に削除" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect(await getStudent(student.id)).not.toBeNull();
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/screens/StudentNew.test.tsx src/screens/StudentEdit.test.tsx`
Expected: FAIL。両方のルートが未定義のため名簿にリダイレクトされ、フォームが見つからない。

- [ ] **Step 4: 確認ダイアログを作る**

`src/components/ConfirmDialog.tsx`。ネイティブの `<dialog>` はテスト環境での挙動が不安定なため、`role="alertdialog"` の要素を自前で描く。開いたら「やめる」に自動でフォーカスを当て、Escapeで閉じる。

```tsx
import { useEffect, useRef } from "react";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = "normal",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "normal" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="bg-gayoshi w-full max-w-sm rounded p-5"
      >
        <h2
          className={`font-display text-xl ${
            tone === "danger" ? "text-shu" : "text-ai"
          }`}
        >
          {title}
        </h2>
        <p className="mt-2 text-sm">{message}</p>

        <div className="mt-5 flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="border-ai text-ai flex-1 rounded border-2 px-4 py-2 font-bold"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded px-4 py-2 font-bold text-white ${
              tone === "danger" ? "bg-shu" : "bg-ai"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 入力フォームを作る**

`src/components/StudentForm.tsx`。追加と編集で共有する。

```tsx
import { useEffect, useState, type FormEvent } from "react";

export type StudentFormValues = { attendanceNumber: number; name: string };

export function StudentForm({
  defaultNumber,
  defaultName,
  showName,
  error,
  submitting,
  primaryLabel,
  secondaryLabel,
  onSubmit,
  onSecondary,
}: {
  defaultNumber: number;
  defaultName: string;
  showName: boolean;
  error: string | null;
  submitting: boolean;
  primaryLabel: string;
  secondaryLabel?: string;
  onSubmit: (values: StudentFormValues) => void;
  onSecondary?: (values: StudentFormValues) => void;
}) {
  const [numberText, setNumberText] = useState(String(defaultNumber));
  const [name, setName] = useState(defaultName);

  // 「保存して続けて追加」の後に次の番号へ進める
  useEffect(() => {
    setNumberText(String(defaultNumber));
  }, [defaultNumber]);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  function values(): StudentFormValues {
    return { attendanceNumber: Number(numberText), name };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">出席番号</span>
        <input
          type="number"
          inputMode="numeric"
          value={numberText}
          onChange={(event) => setNumberText(event.target.value)}
          className="border-ai font-num w-32 rounded border-2 px-3 py-2 text-2xl"
        />
      </label>

      {showName && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">氏名</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="border-ai rounded border-2 px-3 py-2 text-xl"
          />
        </label>
      )}

      {error !== null && (
        <p role="alert" className="text-sm font-bold">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="bg-ai rounded px-4 py-3 font-bold text-white disabled:opacity-50"
        >
          {primaryLabel}
        </button>

        {secondaryLabel !== undefined && onSecondary !== undefined && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSecondary(values())}
            className="border-ai text-ai rounded border-2 px-4 py-3 font-bold disabled:opacity-50"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 6: 追加画面を作る**

`src/screens/StudentNew.tsx`:

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { StudentForm, type StudentFormValues } from "../components/StudentForm";
import { addStudent, nextAttendanceNumber } from "../db/students";
import { useAsync } from "../hooks/useAsync";
import { useSetting } from "../hooks/useSetting";

function StudentNewBody() {
  const cohort = useActiveCohort();
  const navigate = useNavigate();
  const showNames = useSetting("showStudentNames");
  const suggested = useAsync(() => nextAttendanceNumber(cohort.id), [cohort.id]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (suggested.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (suggested.status === "error") {
    return <FullScreenMessage tone="error">{suggested.message}</FullScreenMessage>;
  }

  async function save(values: StudentFormValues): Promise<boolean> {
    setSubmitting(true);
    setError(null);

    try {
      await addStudent({
        cohortId: cohort.id,
        attendanceNumber: values.attendanceNumber,
        name: values.name,
      });
      return true;
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "保存できませんでした。もう一度お試しください",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">生徒を追加</h1>

      <div className="mt-6">
        <StudentForm
          defaultNumber={suggested.data}
          defaultName=""
          showName={showNames.value}
          error={error}
          submitting={submitting}
          primaryLabel="保存する"
          secondaryLabel="保存して続けて追加"
          onSubmit={(values) => {
            void save(values).then((ok) => {
              if (ok) {
                navigate("/roster");
              }
            });
          }}
          onSecondary={(values) => {
            void save(values).then((ok) => {
              if (ok) {
                suggested.reload();
              }
            });
          }}
        />
      </div>

      <Link to="/roster" className="text-ai mt-6 inline-block underline">
        名簿に戻る
      </Link>
    </main>
  );
}

export function StudentNew() {
  return (
    <CohortGate>
      <StudentNewBody />
    </CohortGate>
  );
}
```

- [ ] **Step 7: 編集画面を作る**

`src/screens/StudentEdit.tsx`:

```tsx
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CohortGate } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { StudentForm, type StudentFormValues } from "../components/StudentForm";
import {
  deleteStudent,
  getStudent,
  restoreStudent,
  transferOutStudent,
  updateStudent,
} from "../db/students";
import { useAsync } from "../hooks/useAsync";
import { useSetting } from "../hooks/useSetting";

type Pending = "transferOut" | "delete" | null;

function StudentEditBody({ studentId }: { studentId: string }) {
  const navigate = useNavigate();
  const showNames = useSetting("showStudentNames");
  const loaded = useAsync(() => getStudent(studentId), [studentId]);

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
      <FullScreenMessage tone="error">この生徒は見つかりません</FullScreenMessage>
    );
  }

  const student = loaded.data;
  const transferredOut = student.status === "transferredOut";

  async function run(action: () => Promise<unknown>): Promise<void> {
    setSubmitting(true);
    setError(null);

    try {
      await action();
      navigate("/roster");
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "保存できませんでした。もう一度お試しください",
      );
      setSubmitting(false);
    }
  }

  function handleSubmit(values: StudentFormValues) {
    void run(() =>
      updateStudent(student.id, {
        attendanceNumber: values.attendanceNumber,
        name: values.name,
      }),
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">
        {student.attendanceNumber}番を編集
      </h1>

      <div className="mt-6">
        <StudentForm
          defaultNumber={student.attendanceNumber}
          defaultName={student.name}
          showName={showNames.value}
          error={error}
          submitting={submitting}
          primaryLabel="保存する"
          onSubmit={handleSubmit}
        />
      </div>

      <section className="border-kogan mt-10 border-t pt-6">
        <h2 className="font-display text-ai text-lg">在籍の変更</h2>

        {transferredOut ? (
          <>
            <p className="mt-2 text-sm">
              いまは転出として扱っています。出席番号{student.attendanceNumber}
              は欠番のままです。
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void run(() => restoreStudent(student.id))}
              className="border-ai text-ai mt-3 rounded border-2 px-4 py-2 font-bold disabled:opacity-50"
            >
              在籍に戻す
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm">
              転出にすると名簿から在籍が外れますが、出席番号
              {student.attendanceNumber}は欠番として残ります。印刷済みのQRカードと
              番号がずれません。
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setPending("transferOut")}
              className="border-ai text-ai mt-3 rounded border-2 px-4 py-2 font-bold disabled:opacity-50"
            >
              転出にする
            </button>
          </>
        )}
      </section>

      <section className="border-kogan mt-8 border-t pt-6">
        <h2 className="font-display text-lg">記録を消す</h2>
        <p className="mt-2 text-sm">
          完全に削除すると出席番号{student.attendanceNumber}
          を他の生徒に使えるようになります。転出とは違い、記録は残りません。
        </p>
        <button
          type="button"
          disabled={submitting}
          onClick={() => setPending("delete")}
          className="text-shu mt-3 font-bold underline disabled:opacity-50"
        >
          完全に削除
        </button>
      </section>

      <Link to="/roster" className="text-ai mt-8 inline-block underline">
        名簿に戻る
      </Link>

      {pending === "transferOut" && (
        <ConfirmDialog
          title="転出にしますか"
          message={`出席番号${student.attendanceNumber}は欠番として残ります。`}
          confirmLabel="転出にする"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run(() => transferOutStudent(student.id));
          }}
        />
      )}

      {pending === "delete" && (
        <ConfirmDialog
          title="完全に削除しますか"
          message="この生徒の記録は元に戻せません"
          confirmLabel="削除する"
          tone="danger"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run(() => deleteStudent(student.id));
          }}
        />
      )}
    </main>
  );
}

export function StudentEdit() {
  const { id } = useParams();

  if (id === undefined) {
    return (
      <FullScreenMessage tone="error">この生徒は見つかりません</FullScreenMessage>
    );
  }

  return (
    <CohortGate>
      <StudentEditBody studentId={id} />
    </CohortGate>
  );
}
```

- [ ] **Step 8: ルートを追加する**

`src/App.tsx` の `AppRoutes` に2行足す。`/roster/new` は `/roster/:id/edit` より前に書く必要はないが（パスが異なる）、読みやすさのため追加順に並べる。

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Roster } from "./screens/Roster";
import { Setup } from "./screens/Setup";
import { StudentEdit } from "./screens/StudentEdit";
import { StudentNew } from "./screens/StudentNew";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/roster" element={<Roster />} />
      <Route path="/roster/new" element={<StudentNew />} />
      <Route path="/roster/:id/edit" element={<StudentEdit />} />
      <Route path="*" element={<Navigate to="/roster" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

- [ ] **Step 9: テストを実行して成功を確認する**

Run: `npm run test:run -- src/screens/StudentNew.test.tsx src/screens/StudentEdit.test.tsx`
Expected: PASS（StudentNew 10件、StudentEdit 10件）

- [ ] **Step 10: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 全テストPASS、型エラーなし。

- [ ] **Step 11: 実際に触って確認する**

Run: `npm run dev`
ブラウザ幅375pxで、クラス作成 → 生徒を34人まで「保存して続けて追加」で登録 → 名簿グリッドが4列で収まることを確認する。1人を転出にして欠番のハッチ表示を見る。確認したらサーバーを止める。

- [ ] **Step 12: コミット**

```bash
git add -A
git commit -m "feat: 生徒の追加・編集画面（転出・復帰・完全削除）を追加"
```

---

### Task 8: QRカード印刷画面

ステップ1の成果物。先生がここからラミネート用のシートを刷る。

**Files:**
- Create: `src/components/QrCard.tsx`
- Create: `src/components/PrintSheet.tsx`
- Create: `src/screens/Print.tsx`
- Modify: `src/styles/index.css`（印刷用CSSを追記）
- Modify: `src/App.tsx`（`/print` を足す）
- Test: `src/screens/Print.test.tsx`

**Interfaces:**
- Consumes: `buildQrPayload`, `renderQrSvg`（`../lib/qr`）/ `useStudents` / `useSetting` / `useActiveCohort`, `CohortGate` / `Student`, `Cohort`（`../db/schema`）
- Produces:
  - `CARDS_PER_PAGE: 12`
  - `<QrCard student={student} showName={boolean} />`
  - `<PrintSheet cohort={cohort} students={Student[]} showName={boolean} />` — ページ要素に `data-testid="print-page"`
  - `<Print />`

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/Print.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { setSetting } from "../db/settings";
import { addStudent, transferOutStudent } from "../db/students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderPrint() {
  return render(
    <MemoryRouter initialEntries={["/print"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

async function addStudents(count: number): Promise<void> {
  for (let number = 1; number <= count; number += 1) {
    await addStudent({ cohortId, attendanceNumber: number });
  }
}

describe("印刷するカード", () => {
  it("在籍者のカードを作る", async () => {
    await addStudents(3);
    renderPrint();

    expect(await screen.findAllByTestId("qr-card")).toHaveLength(3);
  });

  it("転出した生徒のカードは作らない", async () => {
    await addStudents(3);
    const out = await addStudent({ cohortId, attendanceNumber: 4 });
    await transferOutStudent(out.id);

    renderPrint();

    const cards = await screen.findAllByTestId("qr-card");
    expect(cards).toHaveLength(3);
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("カードに出席番号とQRを載せる", async () => {
    await addStudents(1);
    renderPrint();

    const card = (await screen.findAllByTestId("qr-card"))[0];
    expect(within(card).getByText("1")).toBeInTheDocument();
    expect(card.querySelector("svg")).not.toBeNull();
  });
});

describe("ページ分け", () => {
  it("12枚までは1ページ", async () => {
    await addStudents(12);
    renderPrint();

    expect(await screen.findAllByTestId("print-page")).toHaveLength(1);
  });

  it("13枚で2ページになる", async () => {
    await addStudents(13);
    renderPrint();

    expect(await screen.findAllByTestId("print-page")).toHaveLength(2);
  });

  it("34人なら3ページになる", async () => {
    await addStudents(34);
    renderPrint();

    const pages = await screen.findAllByTestId("print-page");
    expect(pages).toHaveLength(3);
    expect(within(pages[0]).getAllByTestId("qr-card")).toHaveLength(12);
    expect(within(pages[2]).getAllByTestId("qr-card")).toHaveLength(10);
  });

  it("どのページにも年度とクラス名を刷る", async () => {
    await addStudents(13);
    renderPrint();

    const pages = await screen.findAllByTestId("print-page");
    for (const page of pages) {
      expect(within(page).getByText("2026年度 5年1組")).toBeInTheDocument();
    }
  });
});

describe("氏名の表示設定", () => {
  it("OFFなら氏名を刷らない", async () => {
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });
    renderPrint();

    await screen.findAllByTestId("qr-card");
    expect(screen.queryByText("やまだ")).not.toBeInTheDocument();
  });

  it("ONなら氏名を刷る", async () => {
    await setSetting("showStudentNames", true);
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });
    renderPrint();

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });
});

describe("生徒が居ないとき", () => {
  it("印刷できないことを伝える", async () => {
    renderPrint();

    expect(
      await screen.findByText("在籍している生徒が居ないため印刷できません"),
    ).toBeInTheDocument();
  });
});

```

QRの生成に失敗したときの表示は、モジュールのモックが必要なため別ファイルで扱う（次のステップ）。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/screens/Print.test.tsx`
Expected: FAIL。`/print` が未定義のため名簿にリダイレクトされる。

- [ ] **Step 3: 印刷用CSSを追記する**

`src/styles/index.css` の末尾に足す。寸法はmmで指定し、画面のズームに影響されないようにする。

```css
/* --- QRカードの印刷 --- */

.print-page {
  width: 190mm; /* A4の印字領域（210mm - 余白10mm × 2） */
}

.print-card-grid {
  display: grid;
  grid-template-columns: repeat(3, 55mm);
  column-gap: 12.5mm;
  row-gap: 12.3mm;
}

.qr-card {
  width: 55mm;
  height: 60mm;
  border: 0.2mm dashed var(--color-kogan); /* 裁ち線 */
}

.qr-card svg {
  width: 38mm;
  height: 38mm;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 10mm;
  }

  .no-print {
    display: none !important;
  }

  .print-page {
    break-after: page;
  }

  .print-page:last-child {
    break-after: auto;
  }

  .qr-card {
    break-inside: avoid;
  }
}
```

- [ ] **Step 4: QRカードを作る**

`src/components/QrCard.tsx`。QRの生成は非同期なので、失敗しても他のカードに影響しないようカード単位で状態を持つ。

```tsx
import { useEffect, useState } from "react";
import type { Student } from "../db/schema";
import { buildQrPayload, renderQrSvg } from "../lib/qr";

type QrState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "failed" };

export function QrCard({
  student,
  showName,
}: {
  student: Student;
  showName: boolean;
}) {
  const [qr, setQr] = useState<QrState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setQr({ status: "loading" });

    renderQrSvg(buildQrPayload(student.id))
      .then((svg) => {
        if (!cancelled) {
          setQr({ status: "ready", svg });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQr({ status: "failed" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [student.id]);

  return (
    <div
      data-testid="qr-card"
      className="qr-card flex flex-col items-center justify-center gap-1 bg-white"
    >
      {qr.status === "ready" ? (
        // 自前で生成したQRのSVGのみを入れる
        <div dangerouslySetInnerHTML={{ __html: qr.svg }} />
      ) : qr.status === "failed" ? (
        <p className="px-2 text-center text-[9pt]">QRを生成できませんでした</p>
      ) : (
        <div style={{ width: "38mm", height: "38mm" }} />
      )}

      <span className="font-num text-[20pt] leading-none font-bold">
        {student.attendanceNumber}
      </span>

      {showName && student.name !== "" && (
        <span className="max-w-full truncate px-1 text-[9pt]">{student.name}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 印刷シートを作る**

`src/components/PrintSheet.tsx`:

```tsx
import type { Cohort, Student } from "../db/schema";
import { QrCard } from "./QrCard";

export const CARDS_PER_PAGE = 12;

function toPages(students: Student[]): Student[][] {
  const pages: Student[][] = [];
  for (let index = 0; index < students.length; index += CARDS_PER_PAGE) {
    pages.push(students.slice(index, index + CARDS_PER_PAGE));
  }
  return pages;
}

export function PrintSheet({
  cohort,
  students,
  showName,
}: {
  cohort: Cohort;
  students: Student[];
  showName: boolean;
}) {
  return (
    <>
      {toPages(students).map((page, pageIndex) => (
        <section
          key={pageIndex}
          data-testid="print-page"
          className="print-page mx-auto bg-white p-0"
        >
          <p className="text-kogan mb-3 text-[8pt]">
            {cohort.year}年度 {cohort.className}
          </p>
          <div className="print-card-grid">
            {page.map((student) => (
              <QrCard key={student.id} student={student} showName={showName} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 6: 印刷画面を作る**

`src/screens/Print.tsx`:

```tsx
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { PrintSheet } from "../components/PrintSheet";
import { useSetting } from "../hooks/useSetting";
import { useStudents } from "../hooks/useStudents";

function PrintBody() {
  const cohort = useActiveCohort();
  const students = useStudents(cohort.id);
  const showNames = useSetting("showStudentNames");

  if (students.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (students.status === "error") {
    return <FullScreenMessage tone="error">{students.message}</FullScreenMessage>;
  }

  const active = students.data.filter((student) => student.status === "active");

  if (active.length === 0) {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="font-display text-ai text-2xl">QRを印刷</h1>
        <p className="mt-6">在籍している生徒が居ないため印刷できません</p>
        <Link to="/roster" className="text-ai mt-6 inline-block underline">
          名簿に戻る
        </Link>
      </main>
    );
  }

  return (
    <>
      <div className="no-print mx-auto max-w-3xl p-4">
        <h1 className="font-display text-ai text-2xl">QRを印刷</h1>
        <p className="mt-2 text-sm">
          A4に{active.length}枚のカードを刷ります。破線で切り、ラミネートして
          ドリルの表紙に貼ってください。
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-ai rounded px-4 py-3 font-bold text-white"
          >
            印刷する
          </button>
          <Link
            to="/roster"
            className="border-ai text-ai rounded border-2 px-4 py-3 font-bold"
          >
            名簿に戻る
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <PrintSheet
          cohort={cohort}
          students={active}
          showName={showNames.value}
        />
      </div>
    </>
  );
}

export function Print() {
  return (
    <CohortGate>
      <PrintBody />
    </CohortGate>
  );
}
```

- [ ] **Step 7: QR生成が失敗したときのテストを書く**

`src/components/QrCard.test.tsx`。モジュール全体をモックするため専用ファイルにする（`vi.mock` はファイル先頭に巻き上げられる）。

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Student } from "../db/schema";
import { QrCard } from "./QrCard";

vi.mock("../lib/qr", () => ({
  QR_PAYLOAD_PREFIX: "hw1:",
  buildQrPayload: (studentId: string) => `hw1:${studentId}`,
  renderQrSvg: vi.fn().mockRejectedValue(new Error("生成に失敗しました")),
}));

const student: Student = {
  id: "9f2c1a84-4d3e-4c1b-8f77-2b6c9a0e51d3",
  cohortId: "cohort-1",
  attendanceNumber: 7,
  name: "やまだ",
  status: "active",
  createdAt: 0,
};

describe("QrCard", () => {
  it("QRを作れなくても出席番号は残す", async () => {
    render(<QrCard student={student} showName={false} />);

    expect(
      await screen.findByText("QRを生成できませんでした"),
    ).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
```

Run: `npm run test:run -- src/components/QrCard.test.tsx`
Expected: PASS（1件）

- [ ] **Step 8: ルートを追加する**

`src/App.tsx` を次の内容にする。

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Print } from "./screens/Print";
import { Roster } from "./screens/Roster";
import { Setup } from "./screens/Setup";
import { StudentEdit } from "./screens/StudentEdit";
import { StudentNew } from "./screens/StudentNew";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/roster" element={<Roster />} />
      <Route path="/roster/new" element={<StudentNew />} />
      <Route path="/roster/:id/edit" element={<StudentEdit />} />
      <Route path="/print" element={<Print />} />
      <Route path="*" element={<Navigate to="/roster" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

- [ ] **Step 9: テストを実行して成功を確認する**

Run: `npm run test:run -- src/screens/Print.test.tsx`
Expected: PASS（10件）

- [ ] **Step 10: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 全テストPASS、型エラーなし。

- [ ] **Step 11: 実物を刷って確認する**

Run: `npm run dev`
34人登録した状態で `/print` を開き、ブラウザの印刷プレビューを見る。確認すること:
- A4縦で3ページになる
- 1ページに3列×4行の12枚が収まり、次のページに溢れない
- カードの裁ち線が見える
- **可能なら実際に1枚刷り、QRをスマホのカメラアプリで読む。** `hw1:` で始まる文字列が読み取れれば成功。読めない場合は `src/lib/qr.ts` の `margin` を増やすか、カードのQR寸法を大きくする。

- [ ] **Step 12: コミット**

```bash
git add -A
git commit -m "feat: QRカードのA4印刷画面を追加"
```

---

### Task 9: 設定画面と氏名表示の通し確認

**Files:**
- Create: `src/screens/Settings.tsx`
- Modify: `src/components/AppHeader.tsx`（設定へのリンクを足す）
- Modify: `src/App.tsx`（`/settings` を足す）
- Test: `src/screens/Settings.test.tsx`

**Interfaces:**
- Consumes: `useSetting`（`../hooks/useSetting`）/ `CohortGate`（`../components/CohortGate`）
- Produces: `<Settings />`。`AppHeader` に `aria-label="設定"` のリンクを足す

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/Settings.test.tsx`:

```tsx
import { useFreshDb } from "../test/db";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { getSetting } from "../db/settings";
import { addStudent } from "../db/students";

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

describe("設定画面", () => {
  it("氏名を表示するトグルが最初はOFF", async () => {
    renderAt("/settings");
    expect(await screen.findByRole("checkbox", { name: "氏名を表示する" })).not.toBeChecked();
  });

  it("トグルを入れると保存される", async () => {
    const user = userEvent.setup();
    renderAt("/settings");

    await user.click(await screen.findByRole("checkbox", { name: "氏名を表示する" }));

    expect(await getSetting("showStudentNames")).toBe(true);
  });

  it("名簿から設定に入れる", async () => {
    const user = userEvent.setup();
    renderAt("/roster");

    await user.click(await screen.findByRole("link", { name: "設定" }));

    expect(
      await screen.findByRole("heading", { name: "設定" }),
    ).toBeInTheDocument();
  });
});

describe("氏名の表示は名簿と印刷の両方に効く", () => {
  it("ONにすると名簿に氏名が出る", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });

    renderAt("/settings");
    await user.click(await screen.findByRole("checkbox", { name: "氏名を表示する" }));
    await user.click(screen.getByRole("link", { name: "名簿に戻る" }));

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });

  it("ONにすると印刷シートに氏名が出る", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });

    renderAt("/settings");
    await user.click(await screen.findByRole("checkbox", { name: "氏名を表示する" }));
    await user.click(screen.getByRole("link", { name: "名簿に戻る" }));
    await user.click(await screen.findByRole("link", { name: "QRを印刷" }));

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:run -- src/screens/Settings.test.tsx`
Expected: FAIL。`/settings` が未定義。

- [ ] **Step 3: 設定画面を作る**

`src/screens/Settings.tsx`:

```tsx
import { Link } from "react-router";
import { CohortGate } from "../components/CohortGate";
import { useSetting } from "../hooks/useSetting";

function SettingsBody() {
  const showNames = useSetting("showStudentNames");

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">設定</h1>

      {/*
        説明文をlabelの中に入れると読み上げ名が説明ごと連結されてしまう。
        aria-labelledby で見出しだけを名前にし、説明は describedby にする。
      */}
      <div className="border-kogan mt-6 flex items-start gap-3 border-b pb-4">
        <input
          id="show-names"
          type="checkbox"
          checked={showNames.value}
          onChange={(event) => void showNames.update(event.target.checked)}
          aria-labelledby="show-names-label"
          aria-describedby="show-names-description"
          className="mt-1 size-5"
        />
        <div>
          <label id="show-names-label" htmlFor="show-names" className="font-bold">
            氏名を表示する
          </label>
          <p id="show-names-description" className="mt-1 text-sm">
            名簿と印刷シートに氏名を出します。切っても入力した氏名は残ります。
          </p>
        </div>
      </div>

      <Link to="/roster" className="text-ai mt-8 inline-block underline">
        名簿に戻る
      </Link>
    </main>
  );
}

export function Settings() {
  return (
    <CohortGate>
      <SettingsBody />
    </CohortGate>
  );
}
```

- [ ] **Step 4: ヘッダーに設定への導線を足す**

`src/components/AppHeader.tsx` を差し替える。

```tsx
import { Link } from "react-router";
import type { Cohort } from "../db/schema";

export function AppHeader({
  cohort,
  subtitle,
}: {
  cohort: Cohort;
  subtitle: string;
}) {
  return (
    <header className="border-kogan flex items-start justify-between gap-3 border-b pb-3">
      <div>
        <h1 className="font-display text-ai text-2xl">
          {cohort.year}年度 {cohort.className}
        </h1>
        <p className="mt-1 text-sm">{subtitle}</p>
      </div>
      <Link
        to="/settings"
        aria-label="設定"
        className="text-ai shrink-0 p-2 text-xl"
      >
        ⚙
      </Link>
    </header>
  );
}
```

- [ ] **Step 5: ルートを追加する**

`src/App.tsx` を次の内容にする。これが最終形。

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Print } from "./screens/Print";
import { Roster } from "./screens/Roster";
import { Settings } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { StudentEdit } from "./screens/StudentEdit";
import { StudentNew } from "./screens/StudentNew";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/roster" element={<Roster />} />
      <Route path="/roster/new" element={<StudentNew />} />
      <Route path="/roster/:id/edit" element={<StudentEdit />} />
      <Route path="/print" element={<Print />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/roster" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: テストを実行して成功を確認する**

Run: `npm run test:run -- src/screens/Settings.test.tsx`
Expected: PASS（5件）

- [ ] **Step 7: 全テストと型チェックを通す**

Run: `npm run test:run && npm run build`
Expected: 全テストPASS、型エラーなし。

- [ ] **Step 8: 通しで動作を確認する**

Run: `npm run dev`
初回起動からの流れを一度通す:
1. クラスを作る
2. 生徒を数人追加する
3. 1人を転出にする（欠番のハッチを確認）
4. 設定で氏名表示をONにし、名簿に氏名が出ることを確認
5. QRを印刷のプレビューでA4レイアウトを確認
6. **ブラウザを機内モード / オフラインにして再読み込みし、データが残っていることを確認する**（Service Worker はステップ6のため、この時点ではページ自体の再取得はできない。IndexedDBのデータが消えていないことだけを見る）

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -m "feat: 設定画面と氏名表示の切り替えを追加"
```

---

## 完了条件

- `npm run test:run` が全件PASSする
- `npm run build` が型エラーなく通る
- 初回起動 → クラス作成 → 生徒34人登録 → QRカードのA4印刷、までを実機で通せる
- 印刷したQRをスマホのカメラで読むと `hw1:` で始まる文字列が取れる

## 次のステップ

このタスクの完了後、ステップ2（提出物マスタ + 締切設定）の設計に進む。データモデルの `cohorts` / `students` はそのまま使い、`submissionTypes` と `submissions` のストアを DB バージョン2で追加する。
