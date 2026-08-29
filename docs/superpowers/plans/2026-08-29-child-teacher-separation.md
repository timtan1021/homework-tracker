# 児童用ページと教員用ページの分離 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 子供が自分でQRをスキャンできる児童用ページを作り、教員用ページをパスワードで守る。

**Architecture:** `TeacherAuthProvider`（メモリのみの認証状態）を `AppRoutes` の外に置き、教員ルートをレイアウトルート `<TeacherGate>` でまとめて包む。パスワードは PBKDF2-SHA256 でハッシュ化して `settings` ストアに保存し、忘れたときは合言葉で再設定する。`/` は新しい児童画面になる。

**Tech Stack:** React 19（`use()` と `<Context value>` 記法）、react-router v7、idb、Web Crypto（PBKDF2）、Vitest + Testing Library、Tailwind

**Spec:** `docs/superpowers/specs/2026-08-28-child-teacher-separation-design.md`

## Global Constraints

CLAUDE.md の制約はすべてこの計画のすべてのタスクに適用される。特に効いてくるもの:

- **ネットワークアクセスを書かない。** `fetch`、CDN、外部URL は禁止。暗号ライブラリも足さない（Web Crypto を使う）
- **配色は5トークンのみ**: `gayoshi` / `sumi` / `ai` / `kogan` / `shu`。Tailwind素のカラー（`text-white` 等）を使わない。藍の上の明色は `text-gayoshi`
- **朱は花丸と、完全に元へ戻せない操作の確認ダイアログだけ。** このプロジェクトで朱を新しく使ってよい場所は無い。パスワードのエラー文にも朱を使わない（`font-bold` で示す）
- 書体: 数値は `font-num`、見出しは `font-display`。Klee One を本文に使わない
- UIの文言はすべて日本語。**謝罪表現を使わない。** エラー文は何が起きたかと次にどうするかを示す
- TypeScript `strict`、`any` 禁止、`noUnusedLocals: true`（未使用importでビルドが落ちる）
- 375px幅で崩れない。タップ領域は44px四方以上。出席番号は24pt以上
- **`vi.useFakeTimers` を使わない**（fake-indexeddb が壊れ、`waitFor` が経過時間を測れなくなる）
- **`DB_VERSION` を上げない。** `upgrade()` を変更しない。既存の `settings` ストアに1レコード足すだけ
- テストの競合を避ける: `findBy*` は中身の更新を待たない／既存要素の属性は `waitFor` で囲む／DOM参照を使い回さない／`clear()`+`type()` ではなく `fireEvent.change`

**各タスクで「わざと壊してテストが落ちること」を確認する。** テストが通った事実だけでは、それが何かを守れている証拠にならない。

## ファイル構成

**新規:**

| ファイル | 責務 |
|---|---|
| `src/lib/passphrase.ts` | 合言葉の生成と正規化。DBもReactも知らない |
| `src/db/teacherAuth.ts` | パスワードのハッシュ化・保存・検証 |
| `src/components/TeacherAuthProvider.tsx` | 認証状態（メモリのみ）とContext |
| `src/components/PassphraseNotice.tsx` | 合言葉を控えさせる画面。設定と再設定で共用 |
| `src/screens/TeacherPasswordSetup.tsx` | 初回のパスワード設定 |
| `src/screens/TeacherLogin.tsx` | パスワード入力と合言葉での再設定 |
| `src/components/TeacherGate.tsx` | 3状態の分岐 |
| `src/screens/KidsScan.tsx` | 児童画面 |
| `src/test/router.tsx` | 認証済みでレンダーするテストヘルパー |

**変更:** `src/App.tsx`（ルート構成）、`src/components/AppHeader.tsx`（児童画面に戻る）、既存テスト12件、`docs/手元での確認手順.md`

---

### Task 1: 合言葉の生成と正規化

**Files:**
- Create: `src/lib/passphrase.ts`
- Test: `src/lib/passphrase.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `generatePassphrase(): string`、`normalizePassphrase(input: string): string`、`PASSPHRASE_WORDS: readonly string[]`（テストが語数と中身を検証するために公開する）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/passphrase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  generatePassphrase,
  normalizePassphrase,
  PASSPHRASE_WORDS,
} from "./passphrase";

describe("PASSPHRASE_WORDS", () => {
  // 語そのものは固定しない。入れ替えるたびに壊れるテストになる。
  // 守りたいのは語数と、紙から書き写せる性質のほう。
  it("64語ある", () => {
    expect(PASSPHRASE_WORDS).toHaveLength(64);
  });

  it("重複が無い", () => {
    expect(new Set(PASSPHRASE_WORDS).size).toBe(PASSPHRASE_WORDS.length);
  });

  it("ひらがなだけでできている", () => {
    for (const word of PASSPHRASE_WORDS) {
      expect(word).toMatch(/^[ぁ-ん]+$/);
    }
  });

  it("長音記号を含まない", () => {
    // 正規化がハイフンのつもりで打たれた「ー」を落とすため、
    // 語の側に「ー」があると合言葉が壊れる。
    for (const word of PASSPHRASE_WORDS) {
      expect(word).not.toContain("ー");
    }
  });
});

describe("generatePassphrase", () => {
  it("4語をハイフンで繋ぐ", () => {
    expect(generatePassphrase().split("-")).toHaveLength(4);
  });

  it("語はすべて単語リストから選ばれる", () => {
    for (const word of generatePassphrase().split("-")) {
      expect(PASSPHRASE_WORDS).toContain(word);
    }
  });

  it("呼ぶたびに変わる", () => {
    // 64^4 通りあるので、20回引いて全部同じなら生成が壊れている
    const seen = new Set(Array.from({ length: 20 }, generatePassphrase));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("normalizePassphrase", () => {
  it("ハイフンを落とす", () => {
    expect(normalizePassphrase("あめ-そら")).toBe("あめそら");
  });

  it("空白区切りでも同じ結果になる", () => {
    expect(normalizePassphrase("あめ そら")).toBe("あめそら");
  });

  it("全角空白でも同じ結果になる", () => {
    expect(normalizePassphrase("あめ　そら")).toBe("あめそら");
  });

  it("前後の空白を落とす", () => {
    expect(normalizePassphrase("  あめ-そら  ")).toBe("あめそら");
  });

  it("ハイフンのつもりで打たれた長音記号を落とす", () => {
    expect(normalizePassphrase("あめーそら")).toBe("あめそら");
  });

  it("全角ハイフンや各種ダッシュを落とす", () => {
    expect(normalizePassphrase("あめ−そら–ほし—つき")).toBe(
      "あめそらほしつき",
    );
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/lib/passphrase.test.ts`
Expected: FAIL（`Failed to resolve import "./passphrase"`）

- [ ] **Step 3: 実装する**

`src/lib/passphrase.ts`:

```ts
/**
 * 合言葉。パスワードを忘れたときの唯一の復旧手段。
 *
 * 紙に控えて引き出しに入れる前提なので、読み書きしやすさを優先する。
 * 音が紛れる語を同時に入れない（「ゆき」と「ゆげ」のような1文字違いを避ける）。
 *
 * 強度は 64^4 ≒ 1677万通り。暗号鍵としては弱いが、この合言葉が守るのは
 * 「子供が偶然当てないこと」であり、試行はUIから1回ずつ、各試行が
 * PBKDF2の10万回反復で律速される。
 *
 * 語に長音記号「ー」を入れてはいけない。normalizePassphrase が
 * ハイフンのつもりで打たれた「ー」を落とすため、語の側にあると壊れる。
 */
export const PASSPHRASE_WORDS = [
  "あめ", "いちご", "いろがみ", "いぬ", "うちわ", "うみ", "えき", "えほん",
  "おかし", "おに", "かがみ", "かさ", "かえる", "かぼちゃ", "きり", "くじら",
  "くつ", "くるま", "けむり", "こま", "さかな", "さくら", "しっぽ", "しま",
  "すな", "せみ", "そら", "たいこ", "たけ", "たまご", "ちず", "つき",
  "つくえ", "てら", "とけい", "とり", "なわ", "なつ", "にじ", "ぬの",
  "ねこ", "のはら", "はさみ", "はな", "はやし", "ひかり", "ふうせん", "ふね",
  "へや", "ほし", "まくら", "まめ", "みかん", "みず", "むぎ", "めがね",
  "もり", "やま", "ゆき", "ゆびわ", "よる", "りんご", "わかめ", "わに",
] as const;

const WORD_COUNT = 4;

export function generatePassphrase(): string {
  const picks = crypto.getRandomValues(new Uint32Array(WORD_COUNT));
  // 2^32 は 64 で割り切れるため、剰余による偏りは生じない。
  return Array.from(picks, (n) => PASSPHRASE_WORDS[n % PASSPHRASE_WORDS.length]).join(
    "-",
  );
}

/**
 * 照合の前に揺れを吸収する。紙から書き写すとき、ハイフンを省いたり
 * 空白で区切ったりするのは自然な揺れであり、それで弾かない。
 */
export function normalizePassphrase(input: string): string {
  return input.replace(/[\s　\-‐-―−－ー]/g, "");
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/passphrase.test.ts`
Expected: PASS（16件）

- [ ] **Step 5: わざと壊して、テストが守っていることを確認する**

`PASSPHRASE_WORDS` の1語を `"ゆーびわ"` に書き換えて `npx vitest run src/lib/passphrase.test.ts` を実行する。「長音記号を含まない」が落ちること。もう1語を既存の語と同じ文字列にして「重複が無い」が落ちること。両方確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/lib/passphrase.ts src/lib/passphrase.test.ts
git commit -m "feat: 合言葉の生成と正規化を追加"
```

---

### Task 2: パスワードの保存と検証

**Files:**
- Create: `src/db/teacherAuth.ts`
- Test: `src/db/teacherAuth.test.ts`

**Interfaces:**
- Consumes: `generatePassphrase()`、`normalizePassphrase()`（Task 1）、`ValidationError`（`src/db/errors.ts`）、`getDb()`（`src/db/schema.ts`）
- Produces:
  - `isTeacherPasswordSet(): Promise<boolean>`
  - `setTeacherPassword(password: string): Promise<string>` — 合言葉を返す
  - `verifyTeacherPassword(password: string): Promise<boolean>`
  - `resetTeacherPassword(phrase: string, nextPassword: string): Promise<string>` — 新しい合言葉を返す
  - `MIN_PASSWORD_LENGTH: number`

- [ ] **Step 1: 失敗するテストを書く**

`src/db/teacherAuth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { ValidationError } from "./errors";
import { getDb } from "./schema";
import {
  isTeacherPasswordSet,
  resetTeacherPassword,
  setTeacherPassword,
  verifyTeacherPassword,
} from "./teacherAuth";

useFreshDb();

describe("isTeacherPasswordSet", () => {
  it("未設定なら false", async () => {
    expect(await isTeacherPasswordSet()).toBe(false);
  });

  it("設定すると true", async () => {
    await setTeacherPassword("あさのかい");
    expect(await isTeacherPasswordSet()).toBe(true);
  });

  it("レコードが壊れていたら未設定として扱う", async () => {
    // 開けなくなるより、設定し直せるほうがよい
    const db = await getDb();
    await db.put("settings", { key: "teacherAuth", value: { salt: 1 } });
    expect(await isTeacherPasswordSet()).toBe(false);
  });
});

describe("verifyTeacherPassword", () => {
  it("設定したパスワードで通る", async () => {
    await setTeacherPassword("あさのかい");
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("違うパスワードでは通らない", async () => {
    await setTeacherPassword("あさのかい");
    expect(await verifyTeacherPassword("あさのかー")).toBe(false);
  });

  it("未設定なら通らない", async () => {
    expect(await verifyTeacherPassword("あさのかい")).toBe(false);
  });
});

describe("setTeacherPassword", () => {
  it("平文をどこにも保存しない", async () => {
    await setTeacherPassword("あさのかい");
    const db = await getDb();
    const row = await db.get("settings", "teacherAuth");
    expect(JSON.stringify(row)).not.toContain("あさのかい");
  });

  it("同じパスワードでも保存されるハッシュが毎回変わる", async () => {
    // saltが固定だと、2つの端末のハッシュを見比べて同じパスワードだと分かる
    await setTeacherPassword("あさのかい");
    const db = await getDb();
    const first = await db.get("settings", "teacherAuth");

    await setTeacherPassword("あさのかい");
    const second = await db.get("settings", "teacherAuth");

    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
  });

  it("4文字未満は拒否する", async () => {
    await expect(setTeacherPassword("abc")).rejects.toThrow(
      new ValidationError("パスワードは4文字以上にしてください"),
    );
  });

  it("拒否したときは何も保存しない", async () => {
    await expect(setTeacherPassword("abc")).rejects.toThrow(ValidationError);
    expect(await isTeacherPasswordSet()).toBe(false);
  });

  it("4文字ちょうどは受け付ける", async () => {
    await setTeacherPassword("abcd");
    expect(await verifyTeacherPassword("abcd")).toBe(true);
  });
});

describe("resetTeacherPassword", () => {
  it("合言葉が合えば新しいパスワードで通るようになる", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await resetTeacherPassword(phrase, "あたらしい");
    expect(await verifyTeacherPassword("あたらしい")).toBe(true);
  });

  it("再設定すると古いパスワードでは通らなくなる", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await resetTeacherPassword(phrase, "あたらしい");
    expect(await verifyTeacherPassword("あさのかい")).toBe(false);
  });

  it("ハイフンを省いた合言葉でも通る", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await resetTeacherPassword(phrase.replaceAll("-", ""), "あたらしい");
    expect(await verifyTeacherPassword("あたらしい")).toBe(true);
  });

  it("空白区切りの合言葉でも通る", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await resetTeacherPassword(phrase.replaceAll("-", " "), "あたらしい");
    expect(await verifyTeacherPassword("あたらしい")).toBe(true);
  });

  it("違う合言葉は拒否する", async () => {
    await setTeacherPassword("あさのかい");
    await expect(
      resetTeacherPassword("あめ-そら-ほし-つき", "あたらしい"),
    ).rejects.toThrow(
      new ValidationError("合言葉が違います。控えた紙のとおりに入力してください"),
    );
  });

  it("違う合言葉のときはパスワードを変えない", async () => {
    await setTeacherPassword("あさのかい");
    await expect(
      resetTeacherPassword("あめ-そら-ほし-つき", "あたらしい"),
    ).rejects.toThrow(ValidationError);
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("新しい合言葉を返し、古い合言葉は使えなくなる", async () => {
    const first = await setTeacherPassword("あさのかい");
    const second = await resetTeacherPassword(first, "あたらしい");

    await expect(resetTeacherPassword(first, "みっつめ")).rejects.toThrow(
      ValidationError,
    );
    await resetTeacherPassword(second, "みっつめ");
    expect(await verifyTeacherPassword("みっつめ")).toBe(true);
  });

  it("新しいパスワードが4文字未満なら拒否し、古いままにする", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await expect(resetTeacherPassword(phrase, "abc")).rejects.toThrow(
      new ValidationError("パスワードは4文字以上にしてください"),
    );
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("未設定なら拒否する", async () => {
    await expect(
      resetTeacherPassword("あめ-そら-ほし-つき", "あたらしい"),
    ).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/db/teacherAuth.test.ts`
Expected: FAIL（`Failed to resolve import "./teacherAuth"`）

- [ ] **Step 3: 実装する**

`src/db/teacherAuth.ts`:

```ts
import { generatePassphrase, normalizePassphrase } from "../lib/passphrase";
import { ValidationError } from "./errors";
import { getDb } from "./schema";

const TEACHER_AUTH_KEY = "teacherAuth";
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_BITS = 256;

export const MIN_PASSWORD_LENGTH = 4;

/**
 * 教員パスワードの検証material。平文は保存しない。
 *
 * この鍵が守るのは「小学生が興味本位で名簿を開くこと」であり、
 * DevToolsを開ける相手ではない。IndexedDBは読めるし、このレコードを
 * 消せば「未設定」に戻る。端末内で完結するオフラインアプリの構造上、
 * それ以上は守れない。
 */
type TeacherAuth = {
  salt: string;
  hash: string;
  /** 将来反復回数を上げられるようレコードに持たせる */
  iterations: number;
  recoverySalt: string;
  recoveryHash: string;
};

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

async function derive(
  secret: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    DERIVED_BITS,
  );
  return toBase64(new Uint8Array(bits));
}

function isTeacherAuth(value: unknown): value is TeacherAuth {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.salt === "string" &&
    typeof row.hash === "string" &&
    typeof row.iterations === "number" &&
    typeof row.recoverySalt === "string" &&
    typeof row.recoveryHash === "string"
  );
}

async function readAuth(): Promise<TeacherAuth | null> {
  const db = await getDb();
  const row = await db.get("settings", TEACHER_AUTH_KEY);
  return isTeacherAuth(row?.value) ? row.value : null;
}

/**
 * 検証は単純な文字列比較で行う。定数時間比較は入れない。
 * ハッシュそのものをDevToolsで読める環境で、タイミング差を測る意味がない。
 */
async function matches(
  secret: string,
  salt: string,
  hash: string,
  iterations: number,
): Promise<boolean> {
  return (await derive(secret, fromBase64(salt), iterations)) === hash;
}

async function write(password: string): Promise<string> {
  const passphrase = generatePassphrase();
  const salt = randomSalt();
  const recoverySalt = randomSalt();

  const value: TeacherAuth = {
    salt: toBase64(salt),
    hash: await derive(password, salt, ITERATIONS),
    iterations: ITERATIONS,
    recoverySalt: toBase64(recoverySalt),
    recoveryHash: await derive(
      normalizePassphrase(passphrase),
      recoverySalt,
      ITERATIONS,
    ),
  };

  const db = await getDb();
  await db.put("settings", { key: TEACHER_AUTH_KEY, value });
  return passphrase;
}

export async function isTeacherPasswordSet(): Promise<boolean> {
  return (await readAuth()) !== null;
}

/** 設定して合言葉を返す。返した合言葉は保存されない（ハッシュのみ保存する）。 */
export async function setTeacherPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError("パスワードは4文字以上にしてください");
  }
  return write(password);
}

export async function verifyTeacherPassword(
  password: string,
): Promise<boolean> {
  const auth = await readAuth();
  if (auth === null) {
    return false;
  }
  return matches(password, auth.salt, auth.hash, auth.iterations);
}

/**
 * 合言葉が合えば新しいパスワードを設定し、新しい合言葉を返す。
 * 合言葉も作り直す。古い合言葉を紙で持ったままにしない。
 */
export async function resetTeacherPassword(
  phrase: string,
  nextPassword: string,
): Promise<string> {
  const auth = await readAuth();
  if (auth === null) {
    throw new ValidationError(
      "パスワードがまだ設定されていません。画面を開き直してください",
    );
  }

  const ok = await matches(
    normalizePassphrase(phrase),
    auth.recoverySalt,
    auth.recoveryHash,
    auth.iterations,
  );
  if (!ok) {
    throw new ValidationError(
      "合言葉が違います。控えた紙のとおりに入力してください",
    );
  }

  if (nextPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError("パスワードは4文字以上にしてください");
  }

  return write(nextPassword);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/db/teacherAuth.test.ts`
Expected: PASS（20件）

PBKDF2 の10万回反復は1回あたり数十ms。このファイルは derive を50回近く呼ぶ。実行時間が10秒を超えるようなら報告すること（本番の反復回数を下げる判断が要る）。

- [ ] **Step 5: わざと壊して、テストが守っていることを確認する**

3つ試して、それぞれ想定のテストが落ちることを見る。確認したら元に戻す。

1. `write` の `salt` を固定値（`new Uint8Array(SALT_BYTES)`）にする → 「ハッシュが毎回変わる」が落ちる
2. `resetTeacherPassword` の合言葉チェック `if (!ok)` を削る → 「違う合言葉は拒否する」が落ちる
3. `setTeacherPassword` の長さチェックを削る → 「4文字未満は拒否する」が落ちる

- [ ] **Step 6: コミット**

```bash
git add src/db/teacherAuth.ts src/db/teacherAuth.test.ts
git commit -m "feat: 教員パスワードの保存と検証を追加"
```

---

### Task 3: 認証状態の保持（Context）

**Files:**
- Create: `src/components/TeacherAuthProvider.tsx`
- Test: `src/components/TeacherAuthProvider.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces:
  - `TeacherAuthContext`（`Context<TeacherAuthValue | null>`、テストが認証済み状態を注入する唯一の口）
  - `TeacherAuthProvider({ children }: { children: ReactNode })`
  - `useTeacherAuth(): TeacherAuthValue`
  - `type TeacherAuthValue = { authenticated: boolean; signIn: () => void; signOut: () => void }`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeacherAuthProvider.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TeacherAuthProvider, useTeacherAuth } from "./TeacherAuthProvider";

function Probe() {
  const { authenticated, signIn, signOut } = useTeacherAuth();
  return (
    <div>
      <p>{authenticated ? "認証済み" : "未認証"}</p>
      <button type="button" onClick={signIn}>
        入る
      </button>
      <button type="button" onClick={signOut}>
        出る
      </button>
    </div>
  );
}

describe("TeacherAuthProvider", () => {
  it("最初は未認証", () => {
    render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    expect(screen.getByText("未認証")).toBeInTheDocument();
  });

  it("signIn で認証済みになる", async () => {
    const user = userEvent.setup();
    render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "入る" }));

    expect(screen.getByText("認証済み")).toBeInTheDocument();
  });

  it("signOut で未認証に戻る", async () => {
    const user = userEvent.setup();
    render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "入る" }));
    await user.click(screen.getByRole("button", { name: "出る" }));

    expect(screen.getByText("未認証")).toBeInTheDocument();
  });

  it("作り直すと未認証に戻る", async () => {
    // リロード相当。認証状態をメモリだけに置いていることを守る。
    // sessionStorage に書くと、この期待が壊れる。
    const user = userEvent.setup();
    const { unmount } = render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "入る" }));
    unmount();

    render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    expect(screen.getByText("未認証")).toBeInTheDocument();
  });

  it("Provider の外で使うと例外を投げる", () => {
    // フェイルクローズ。Provider を付け忘れたルートが
    // 認証なしで通ってしまう事故を防ぐ。
    expect(() => render(<Probe />)).toThrow();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/components/TeacherAuthProvider.test.tsx`
Expected: FAIL（`Failed to resolve import "./TeacherAuthProvider"`）

- [ ] **Step 3: 実装する**

`src/components/TeacherAuthProvider.tsx`:

```tsx
import { createContext, use, useMemo, useState, type ReactNode } from "react";

export type TeacherAuthValue = {
  authenticated: boolean;
  signIn: () => void;
  signOut: () => void;
};

/**
 * テストが認証済み状態を作るための唯一の口。
 *
 * `TeacherAuthProvider` に `initialAuthenticated` のような prop は持たせない。
 * 本番のコンポーネントに認証を素通りさせる引数を作ると、いつか本番の
 * 呼び出し側で渡される。テストは Provider を使わず Context に値を直接与える。
 */
export const TeacherAuthContext = createContext<TeacherAuthValue | null>(null);

/** TeacherAuthProvider の内側でのみ使える。 */
export function useTeacherAuth(): TeacherAuthValue {
  const value = use(TeacherAuthContext);
  if (value === null) {
    throw new Error("useTeacherAuth は TeacherAuthProvider の中でのみ使えます");
  }
  return value;
}

export function TeacherAuthProvider({ children }: { children: ReactNode }) {
  // 認証状態はメモリだけに置く。sessionStorage にも localStorage にも
  // 書かない。「リロードとアプリの再起動で解除される」という要件が、
  // 何も書かないことによって満たされる。保存する仕組みを足せば、
  // 解除する仕組みも足さねばならない。
  const [authenticated, setAuthenticated] = useState(false);

  const value = useMemo<TeacherAuthValue>(
    () => ({
      authenticated,
      signIn: () => setAuthenticated(true),
      signOut: () => setAuthenticated(false),
    }),
    [authenticated],
  );

  return <TeacherAuthContext value={value}>{children}</TeacherAuthContext>;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components/TeacherAuthProvider.test.tsx`
Expected: PASS（5件）

「Provider の外で使うと例外を投げる」は React がエラーを stderr に出す。テストは通る。

- [ ] **Step 5: わざと壊して、テストが守っていることを確認する**

`useState(false)` を `useState(true)` にすると「最初は未認証」が落ちる。`useTeacherAuth` の `null` チェックを外して `value!` を返すようにすると「Provider の外で使うと例外を投げる」が落ちる。確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/components/TeacherAuthProvider.tsx src/components/TeacherAuthProvider.test.tsx
git commit -m "feat: 教員認証の状態をメモリに保持するProviderを追加"
```

---

### Task 4: 合言葉を控えさせる画面

**Files:**
- Create: `src/components/PassphraseNotice.tsx`
- Test: `src/components/PassphraseNotice.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `PassphraseNotice({ passphrase, onDone }: { passphrase: string; onDone: () => void })`

初回設定と再設定の両方から使う。この画面を閉じると合言葉は二度と表示できない（ハッシュしか保存していない）ため、控えたことを確認するまで先へ進ませない。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/PassphraseNotice.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PassphraseNotice } from "./PassphraseNotice";

describe("PassphraseNotice", () => {
  it("合言葉を表示する", () => {
    render(
      <PassphraseNotice passphrase="あめ-そら-ほし-つき" onDone={() => {}} />,
    );

    expect(screen.getByText("あめ-そら-ほし-つき")).toBeInTheDocument();
  });

  it("控えるまで先へ進めない", () => {
    render(
      <PassphraseNotice passphrase="あめ-そら-ほし-つき" onDone={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "はじめる" })).toBeDisabled();
  });

  it("控えたことを確認すると先へ進める", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <PassphraseNotice passphrase="あめ-そら-ほし-つき" onDone={onDone} />,
    );

    await user.click(screen.getByRole("checkbox", { name: "紙に控えました" }));
    await user.click(screen.getByRole("button", { name: "はじめる" }));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("二度と表示できないことを伝える", () => {
    render(
      <PassphraseNotice passphrase="あめ-そら-ほし-つき" onDone={() => {}} />,
    );

    expect(
      screen.getByText(/この画面を閉じると二度と表示できません/),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/components/PassphraseNotice.test.tsx`
Expected: FAIL（`Failed to resolve import "./PassphraseNotice"`）

- [ ] **Step 3: 実装する**

`src/components/PassphraseNotice.tsx`:

```tsx
import { useState } from "react";

/**
 * 合言葉を控えさせる。保存しているのはハッシュだけなので、
 * この画面を閉じると同じ合言葉は二度と出せない。
 */
export function PassphraseNotice({
  passphrase,
  onDone,
}: {
  passphrase: string;
  onDone: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">合言葉を控えてください</h1>

      <p className="mt-4">
        パスワードを忘れたときは、この合言葉でパスワードを決め直せます。
        紙に書いて保管してください。
        <strong className="font-bold">
          この画面を閉じると二度と表示できません。
        </strong>
      </p>

      <p className="border-ai font-num mt-6 rounded border-2 px-4 py-5 text-center text-2xl font-bold">
        {passphrase}
      </p>

      <div className="mt-6 flex items-start gap-3">
        <input
          id="passphrase-acknowledged"
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-1 size-5"
        />
        <label htmlFor="passphrase-acknowledged" className="font-bold">
          紙に控えました
        </label>
      </div>

      <button
        type="button"
        disabled={!acknowledged}
        onClick={onDone}
        className="bg-ai text-gayoshi mt-6 min-h-11 w-full rounded px-4 py-3 font-bold disabled:opacity-50"
      >
        はじめる
      </button>
    </main>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components/PassphraseNotice.test.tsx`
Expected: PASS（4件）

- [ ] **Step 5: わざと壊して、テストが守っていることを確認する**

`disabled={!acknowledged}` を消すと「控えるまで先へ進めない」が落ちる。確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/components/PassphraseNotice.tsx src/components/PassphraseNotice.test.tsx
git commit -m "feat: 合言葉を控えさせる画面を追加"
```

---

### Task 5: 初回のパスワード設定画面

**Files:**
- Create: `src/screens/TeacherPasswordSetup.tsx`
- Test: `src/screens/TeacherPasswordSetup.test.tsx`

**Interfaces:**
- Consumes: `setTeacherPassword()`（Task 2）、`PassphraseNotice`（Task 4）、`ValidationError`
- Produces: `TeacherPasswordSetup({ onDone }: { onDone: () => void })`

打ち間違えたまま鍵を掛けると合言葉でしか戻れないため、パスワードを2回入力させる。

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/TeacherPasswordSetup.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { isTeacherPasswordSet, verifyTeacherPassword } from "../db/teacherAuth";
import { TeacherPasswordSetup } from "./TeacherPasswordSetup";

useFreshDb();

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  confirm: string,
) {
  await user.type(screen.getByLabelText("パスワード"), password);
  await user.type(screen.getByLabelText("パスワード（もう一度）"), confirm);
  await user.click(screen.getByRole("button", { name: "決定" }));
}

describe("TeacherPasswordSetup", () => {
  it("パスワードを設定すると合言葉が出る", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await fillAndSubmit(user, "あさのかい", "あさのかい");

    expect(
      await screen.findByText("合言葉を控えてください"),
    ).toBeInTheDocument();
  });

  it("設定したパスワードで通るようになる", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await fillAndSubmit(user, "あさのかい", "あさのかい");
    await screen.findByText("合言葉を控えてください");

    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("合言葉を控えてから onDone を呼ぶ", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<TeacherPasswordSetup onDone={onDone} />);

    await fillAndSubmit(user, "あさのかい", "あさのかい");
    await screen.findByText("合言葉を控えてください");

    await user.click(screen.getByRole("checkbox", { name: "紙に控えました" }));
    await user.click(screen.getByRole("button", { name: "はじめる" }));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("2回の入力が違うと保存しない", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await fillAndSubmit(user, "あさのかい", "あさのかー");

    expect(
      await screen.findByText("同じパスワードをもう一度入力してください"),
    ).toBeInTheDocument();
    expect(await isTeacherPasswordSet()).toBe(false);
  });

  it("4文字未満は保存しない", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await fillAndSubmit(user, "abc", "abc");

    expect(
      await screen.findByText("パスワードは4文字以上にしてください"),
    ).toBeInTheDocument();
    expect(await isTeacherPasswordSet()).toBe(false);
  });

  it("入力欄はパスワードとして扱う", async () => {
    render(<TeacherPasswordSetup onDone={() => {}} />);

    expect(screen.getByLabelText("パスワード")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByLabelText("パスワード（もう一度）")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("保存中は二重に押せない", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await user.type(screen.getByLabelText("パスワード"), "あさのかい");
    await user.type(
      screen.getByLabelText("パスワード（もう一度）"),
      "あさのかい",
    );
    await user.click(screen.getByRole("button", { name: "決定" }));

    // PBKDF2 の計算中はボタンが無効になる。再描画で要素が差し替わるため
    // 掴んだ参照を使い回さず、waitFor の中で毎回引き直す。
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "決定" })).toBeDisabled();
    });
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/screens/TeacherPasswordSetup.test.tsx`
Expected: FAIL（`Failed to resolve import "./TeacherPasswordSetup"`）

- [ ] **Step 3: 実装する**

`src/screens/TeacherPasswordSetup.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { PassphraseNotice } from "../components/PassphraseNotice";
import { ValidationError } from "../db/errors";
import { setTeacherPassword } from "../db/teacherAuth";

/**
 * 初回だけ通る画面。
 *
 * 打ち間違えたまま鍵を掛けると合言葉でしか戻れないため、2回入力させる。
 */
export function TeacherPasswordSetup({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [passphrase, setPassphrase] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("同じパスワードをもう一度入力してください");
      return;
    }

    setSaving(true);
    try {
      setPassphrase(await setTeacherPassword(password));
    } catch (cause: unknown) {
      setError(
        cause instanceof ValidationError
          ? cause.message
          : "設定を保存できませんでした。もう一度お試しください",
      );
    } finally {
      setSaving(false);
    }
  }

  if (passphrase !== null) {
    return <PassphraseNotice passphrase={passphrase} onDone={onDone} />;
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">
        先生用のパスワードを決めてください
      </h1>

      <p className="mt-4">
        名簿と集計を子供が開けないようにします。朝の会の前に入力するので、
        すぐ打てるものにしてください。
      </p>

      <form onSubmit={(event) => void submit(event)} className="mt-6">
        <label className="flex flex-col gap-1">
          <span className="font-bold">パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            className="border-ai rounded border-2 px-3 py-2 text-xl"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1">
          <span className="font-bold">パスワード（もう一度）</span>
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            className="border-ai rounded border-2 px-3 py-2 text-xl"
          />
        </label>

        {error !== null && (
          <p role="alert" className="mt-4 font-bold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-ai text-gayoshi mt-6 min-h-11 w-full rounded px-4 py-3 font-bold disabled:opacity-50"
        >
          決定
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/screens/TeacherPasswordSetup.test.tsx`
Expected: PASS（7件）

- [ ] **Step 5: わざと壊して、テストが守っていることを確認する**

`if (password !== confirm)` の分岐を削ると「2回の入力が違うと保存しない」が落ちる。確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/screens/TeacherPasswordSetup.tsx src/screens/TeacherPasswordSetup.test.tsx
git commit -m "feat: 初回のパスワード設定画面を追加"
```

---

### Task 6: パスワード入力と合言葉での再設定

**Files:**
- Create: `src/screens/TeacherLogin.tsx`
- Test: `src/screens/TeacherLogin.test.tsx`

**Interfaces:**
- Consumes: `verifyTeacherPassword()`、`resetTeacherPassword()`、`setTeacherPassword()`（Task 2）、`PassphraseNotice`（Task 4）、`ValidationError`
- Produces: `TeacherLogin({ onSuccess }: { onSuccess: () => void })`

誤入力回数によるロックアウトは入れない。PBKDF2 の反復が総当たりを遅くしており、鍵を掛けた先生自身が締め出される害のほうが大きい。

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/TeacherLogin.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { setTeacherPassword, verifyTeacherPassword } from "../db/teacherAuth";
import { TeacherLogin } from "./TeacherLogin";

useFreshDb();

let passphrase = "";

beforeEach(async () => {
  passphrase = await setTeacherPassword("あさのかい");
});

describe("パスワードで入る", () => {
  it("正しいパスワードで onSuccess を呼ぶ", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<TeacherLogin onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("パスワード"), "あさのかい");
    await user.click(screen.getByRole("button", { name: "入る" }));

    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  it("違うパスワードでは onSuccess を呼ばない", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<TeacherLogin onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("パスワード"), "ちがう");
    await user.click(screen.getByRole("button", { name: "入る" }));

    expect(
      await screen.findByText("パスワードが違います"),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("入力欄はパスワードとして扱う", () => {
    render(<TeacherLogin onSuccess={() => {}} />);

    expect(screen.getByLabelText("パスワード")).toHaveAttribute(
      "type",
      "password",
    );
  });
});

describe("合言葉で決め直す", () => {
  async function openRecovery(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      screen.getByRole("button", { name: "パスワードを忘れたとき" }),
    );
  }

  async function submitRecovery(
    user: ReturnType<typeof userEvent.setup>,
    phrase: string,
    next: string,
  ) {
    await user.type(screen.getByLabelText("合言葉"), phrase);
    await user.type(screen.getByLabelText("新しいパスワード"), next);
    await user.click(screen.getByRole("button", { name: "決め直す" }));
  }

  it("正しい合言葉で新しいパスワードに変わる", async () => {
    const user = userEvent.setup();
    render(<TeacherLogin onSuccess={() => {}} />);

    await openRecovery(user);
    await submitRecovery(user, passphrase, "あたらしい");

    expect(
      await screen.findByText("合言葉を控えてください"),
    ).toBeInTheDocument();
    expect(await verifyTeacherPassword("あたらしい")).toBe(true);
  });

  it("新しい合言葉を控えてから onSuccess を呼ぶ", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<TeacherLogin onSuccess={onSuccess} />);

    await openRecovery(user);
    await submitRecovery(user, passphrase, "あたらしい");
    await screen.findByText("合言葉を控えてください");

    expect(onSuccess).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "紙に控えました" }));
    await user.click(screen.getByRole("button", { name: "はじめる" }));

    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("違う合言葉では変わらない", async () => {
    const user = userEvent.setup();
    render(<TeacherLogin onSuccess={() => {}} />);

    await openRecovery(user);
    await submitRecovery(user, "あめ-そら-ほし-つき", "あたらしい");

    expect(
      await screen.findByText(
        "合言葉が違います。控えた紙のとおりに入力してください",
      ),
    ).toBeInTheDocument();
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("新しいパスワードが4文字未満なら断る", async () => {
    const user = userEvent.setup();
    render(<TeacherLogin onSuccess={() => {}} />);

    await openRecovery(user);
    await submitRecovery(user, passphrase, "abc");

    expect(
      await screen.findByText("パスワードは4文字以上にしてください"),
    ).toBeInTheDocument();
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("パスワード入力に戻れる", async () => {
    const user = userEvent.setup();
    render(<TeacherLogin onSuccess={() => {}} />);

    await openRecovery(user);
    await user.click(screen.getByRole("button", { name: "やめる" }));

    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/screens/TeacherLogin.test.tsx`
Expected: FAIL（`Failed to resolve import "./TeacherLogin"`）

- [ ] **Step 3: 実装する**

`src/screens/TeacherLogin.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { PassphraseNotice } from "../components/PassphraseNotice";
import { ValidationError } from "../db/errors";
import {
  resetTeacherPassword,
  verifyTeacherPassword,
} from "../db/teacherAuth";

/**
 * 誤入力回数によるロックアウトは入れない。PBKDF2 の反復が総当たりを
 * 遅くしており、鍵を掛けた先生自身が締め出される害のほうが大きい。
 */
export function TeacherLogin({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"password" | "recovery">("password");
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passphrase, setPassphrase] = useState<string | null>(null);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (await verifyTeacherPassword(password)) {
        onSuccess();
        return;
      }
      setError("パスワードが違います");
    } catch {
      setError("パスワードを確認できませんでした。画面を開き直してください");
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setPassphrase(await resetTeacherPassword(phrase, nextPassword));
    } catch (cause: unknown) {
      setError(
        cause instanceof ValidationError
          ? cause.message
          : "決め直せませんでした。もう一度お試しください",
      );
    } finally {
      setBusy(false);
    }
  }

  if (passphrase !== null) {
    return <PassphraseNotice passphrase={passphrase} onDone={onSuccess} />;
  }

  if (mode === "recovery") {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="font-display text-ai text-2xl">
          合言葉でパスワードを決め直す
        </h1>

        <p className="mt-4">
          パスワードを決めたときに控えた合言葉を入力してください。
        </p>

        <form onSubmit={(event) => void reset(event)} className="mt-6">
          <label className="flex flex-col gap-1">
            <span className="font-bold">合言葉</span>
            <input
              type="text"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              className="border-ai rounded border-2 px-3 py-2 text-xl"
            />
          </label>

          <label className="mt-4 flex flex-col gap-1">
            <span className="font-bold">新しいパスワード</span>
            <input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              autoComplete="new-password"
              className="border-ai rounded border-2 px-3 py-2 text-xl"
            />
          </label>

          {error !== null && (
            <p role="alert" className="mt-4 font-bold">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="bg-ai text-gayoshi mt-6 min-h-11 w-full rounded px-4 py-3 font-bold disabled:opacity-50"
          >
            決め直す
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode("password");
            setError(null);
          }}
          className="text-ai mt-6 min-h-11 px-2 font-bold underline"
        >
          やめる
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">先生用</h1>

      <form onSubmit={(event) => void signIn(event)} className="mt-6">
        <label className="flex flex-col gap-1">
          <span className="font-bold">パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="border-ai rounded border-2 px-3 py-2 text-xl"
          />
        </label>

        {error !== null && (
          <p role="alert" className="mt-4 font-bold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="bg-ai text-gayoshi mt-6 min-h-11 w-full rounded px-4 py-3 font-bold disabled:opacity-50"
        >
          入る
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode("recovery");
          setError(null);
        }}
        className="text-ai mt-6 min-h-11 px-2 font-bold underline"
      >
        パスワードを忘れたとき
      </button>
    </main>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/screens/TeacherLogin.test.tsx`
Expected: PASS（9件）

- [ ] **Step 5: わざと壊して、テストが守っていることを確認する**

`signIn` の `if (await verifyTeacherPassword(password))` を `if (true)` にすると「違うパスワードでは onSuccess を呼ばない」が落ちる。**これが最も重要な確認**で、ここが素通りすると鍵そのものが無意味になる。確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/screens/TeacherLogin.tsx src/screens/TeacherLogin.test.tsx
git commit -m "feat: パスワード入力と合言葉での再設定を追加"
```

---

### Task 7: TeacherGate（3状態の分岐）

**Files:**
- Create: `src/components/TeacherGate.tsx`
- Test: `src/components/TeacherGate.test.tsx`

**Interfaces:**
- Consumes: `useTeacherAuth()`、`TeacherAuthContext`（Task 3）、`isTeacherPasswordSet()`（Task 2）、`TeacherPasswordSetup`（Task 5）、`TeacherLogin`（Task 6）、`useAsync`、`FullScreenMessage`
- Produces: `TeacherGate({ children }: { children: ReactNode })`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TeacherGate.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { setTeacherPassword } from "../db/teacherAuth";
import { TeacherAuthProvider } from "./TeacherAuthProvider";
import { TeacherGate } from "./TeacherGate";

useFreshDb();

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderGate() {
  return render(
    <TeacherAuthProvider>
      <TeacherGate>
        <p>名簿の中身</p>
      </TeacherGate>
    </TeacherAuthProvider>,
  );
}

describe("パスワード未設定のとき", () => {
  it("設定画面を出す", async () => {
    renderGate();

    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });

  it("中身を見せない", async () => {
    renderGate();

    await screen.findByText("先生用のパスワードを決めてください");
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });
});

describe("パスワード設定済みのとき", () => {
  it("入力画面を出し、中身を見せない", async () => {
    await setTeacherPassword("あさのかい");
    renderGate();

    expect(await screen.findByLabelText("パスワード")).toBeInTheDocument();
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });

  it("正しいパスワードを入れると中身が出る", async () => {
    const user = userEvent.setup();
    await setTeacherPassword("あさのかい");
    renderGate();

    await user.type(
      await screen.findByLabelText("パスワード"),
      "あさのかい",
    );
    await user.click(screen.getByRole("button", { name: "入る" }));

    expect(await screen.findByText("名簿の中身")).toBeInTheDocument();
  });

  it("違うパスワードでは中身が出ない", async () => {
    const user = userEvent.setup();
    await setTeacherPassword("あさのかい");
    renderGate();

    await user.type(await screen.findByLabelText("パスワード"), "ちがう");
    await user.click(screen.getByRole("button", { name: "入る" }));

    await screen.findByText("パスワードが違います");
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });
});

describe("Provider を作り直したとき", () => {
  it("もう一度パスワードを求める", async () => {
    // リロード相当。認証状態がメモリだけにあることを守る。
    const user = userEvent.setup();
    await setTeacherPassword("あさのかい");

    const { unmount } = renderGate();
    await user.type(
      await screen.findByLabelText("パスワード"),
      "あさのかい",
    );
    await user.click(screen.getByRole("button", { name: "入る" }));
    await screen.findByText("名簿の中身");

    unmount();
    renderGate();

    expect(await screen.findByLabelText("パスワード")).toBeInTheDocument();
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });
});

describe("crypto.subtle が使えないとき", () => {
  it("https で開くよう伝え、中身を見せない", async () => {
    // セキュアコンテキストでなければ crypto.subtle は存在せず、
    // パスワードの検証ができない。黙って壊れないようにする。
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues });

    renderGate();

    expect(
      await screen.findByText(/https で接続してください/),
    ).toBeInTheDocument();
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/components/TeacherGate.test.tsx`
Expected: FAIL（`Failed to resolve import "./TeacherGate"`）

- [ ] **Step 3: 実装する**

`src/components/TeacherGate.tsx`:

```tsx
import type { ReactNode } from "react";
import { isTeacherPasswordSet } from "../db/teacherAuth";
import { useAsync } from "../hooks/useAsync";
import { TeacherLogin } from "../screens/TeacherLogin";
import { TeacherPasswordSetup } from "../screens/TeacherPasswordSetup";
import { FullScreenMessage } from "./FullScreenMessage";
import { useTeacherAuth } from "./TeacherAuthProvider";

/**
 * 教員ルートの入口。
 *
 * `showBackLink={false}` を渡すのは、既定の戻り先が `/roster` で、
 * それ自身がこのガードの内側にあるため。導線を出すとループする。
 */
export function TeacherGate({ children }: { children: ReactNode }) {
  const { authenticated, signIn } = useTeacherAuth();
  const state = useAsync(() => isTeacherPasswordSet(), "teacher-password-set");

  // セキュアコンテキストでなければ crypto.subtle が存在しない。
  // 児童画面のカメラも同じ制約で動かないため、条件は一致している。
  if (typeof globalThis.crypto?.subtle === "undefined") {
    return (
      <FullScreenMessage tone="error" showBackLink={false}>
        この画面を開くには https で接続してください。いまの接続では
        パスワードを確認できません
      </FullScreenMessage>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  if (state.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (state.status === "error") {
    return (
      <FullScreenMessage tone="error" showBackLink={false}>
        {state.message}
      </FullScreenMessage>
    );
  }

  return state.data ? (
    <TeacherLogin onSuccess={signIn} />
  ) : (
    <TeacherPasswordSetup onDone={signIn} />
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components/TeacherGate.test.tsx`
Expected: PASS（7件）

- [ ] **Step 5: わざと壊して、テストが守っていることを確認する**

**このタスクで最も重要な確認。** `if (authenticated)` の行を `if (true)` に変えると、「中身を見せない」系のテストが複数落ちること。1つでも通ってしまうテストがあれば、そのテストは守れていない。確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/components/TeacherGate.tsx src/components/TeacherGate.test.tsx
git commit -m "feat: 教員ルートを守るTeacherGateを追加"
```

---

### Task 8: 児童画面

**Files:**
- Create: `src/screens/KidsScan.tsx`
- Test: `src/screens/KidsScan.test.tsx`

**Interfaces:**
- Consumes: `CohortGate`、`useActiveCohort`、`SubmissionToggleBar`、`ScanResult`、`CameraView`、`useQrCamera`、`useSubmissionTypes`、`recordSubmission`、`isDueOn`、`toDateKey`、`formatDateHeading`、`parseQrPayload`、`buildQrPayload`（テストで使う）
- Produces: `KidsScan()`

教員用スキャン（`src/screens/Scan.tsx`）は変更せずそのまま残す。カードを忘れた子や欠席者を先生が代わりに記録する手段が要るため。

**このタスクを始める前に押さえておくこと（調査済み）:**

1. **`useQrCamera` は jsdom で動かない。** `getUserMedia` + `requestAnimationFrame` + canvas + `jsQR` を使う。既存の `Scan.test.tsx` にカメラのモックは無く、スキャンの結合テストも無い（番号パッド経由でテストしている）。児童画面は番号パッドを持たないので、**このタスクで初めてフックをモックする**。方法は Step 1 に書いてある。
2. **`useStudents` は使わない。** `recordSubmission` が生徒の存在確認まで行い、`{ kind: "notFound" }` / `{ kind: "transferredOut", student }` を返す（`src/db/submissions.ts:53,56`）。児童画面は番号パッドを出さないので生徒一覧を必要としない。読み込みが1つ減る。
3. **`RecordResult` の形**（`src/db/submissions.ts:4-8`）:
   ```ts
   type RecordResult =
     | { kind: "recorded"; student: Student }
     | { kind: "already"; student: Student }
     | { kind: "transferredOut"; student: Student }
     | { kind: "notFound" };
   ```
4. **`ScanResult` はそのまま使う。** 「提出しました」「提出済み」は漢字だが、小5は読める。児童用にラベルを差し替える props を足すのは、教員画面と共有しているコンポーネントに分岐を持ち込むだけの価値がない（YAGNI）。
5. **`CameraView` の文言は児童画面に流用できない。** カメラが使えないとき `useQrCamera` が返すメッセージは「この開き方ではカメラを使えません。**番号でチェックしてください**」「カメラを使えません。端末の設定で許可するか、**番号でチェックしてください**」（`src/hooks/useQrCamera.ts:12,130`）。児童画面に番号パッドは無いので、子供には打つ手が無い指示になる。`state` が `"unavailable"` か `"denied"` のときは `CameraView` を出さず「せんせいを よんでください」を出す。

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/KidsScan.test.tsx`:

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "../db/cohorts";
import { addStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { listSubmissions } from "../db/submissions";
import { toDateKey } from "../lib/date";
import { buildQrPayload } from "../lib/qr";
import { KidsScan } from "./KidsScan";

// useQrCamera は getUserMedia と requestAnimationFrame と canvas と jsQR を
// 使うため jsdom では動かない。onScan を掴んで、外からスキャンを起こす。
// vi.mock はホイストされるので、掴む先は vi.hoisted で先に作る。
const camera = vi.hoisted(() => ({
  onScan: null as ((payload: string) => void) | null,
  state: "running" as "running" | "starting" | "unavailable" | "denied",
  message: null as string | null,
}));

vi.mock("../hooks/useQrCamera", () => ({
  useQrCamera: ({ onScan }: { onScan: (payload: string) => void }) => {
    camera.onScan = onScan;
    return {
      state: camera.state,
      message: camera.message,
      videoRef: { current: null },
      canvasRef: { current: null },
    };
  },
  cameraUnavailableReason: () => null,
}));

useFreshDb();

const TODAY = new Date();
const TODAY_KEY = toDateKey(TODAY);
const TODAY_WEEKDAY = TODAY.getDay();

let cohortId = "";

beforeEach(async () => {
  camera.state = "running";
  camera.message = null;
  camera.onScan = null;

  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function addType(name: string, weekdays = [TODAY_WEEKDAY]) {
  return addSubmissionType({ cohortId, name, deadline: "08:15", weekdays });
}

function renderKids() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <KidsScan />
    </MemoryRouter>,
  );
}

/** QRカードをかざしたことにする。 */
async function scanCard(studentId: string) {
  await act(async () => {
    camera.onScan?.(buildQrPayload(studentId));
  });
}

function addKid(attendanceNumber: number) {
  return addStudent({ cohortId, attendanceNumber, name: "" });
}

describe("提出物の選択", () => {
  it("最初は何も選ばれていない", async () => {
    await addType("かんじドリル");
    renderKids();

    expect(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("選んでいないうちは選ぶよう促す", async () => {
    await addType("かんじドリル");
    renderKids();

    expect(
      await screen.findByText("だしたものを えらんでね"),
    ).toBeInTheDocument();
  });

  it("タップすると選べる", async () => {
    const user = userEvent.setup();
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );

    // 再描画で要素が差し替わるため、掴んだ参照を使い回さず毎回引き直す
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /かんじドリル/ }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });
});

describe("スキャン", () => {
  it("何も選んでいなければ記録しない", async () => {
    const student = await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await screen.findByText("だしたものを えらんでね");
    await scanCard(student.id);

    expect(await listSubmissions(cohortId, TODAY_KEY)).toHaveLength(0);
  });

  it("選んでからかざすと記録する", async () => {
    const user = userEvent.setup();
    const student = await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);

    await waitFor(async () => {
      expect(await listSubmissions(cohortId, TODAY_KEY)).toHaveLength(1);
    });
  });

  it("選んだものだけ記録する", async () => {
    // 今日の提出物が2つあり、片方だけ出した子。もう片方は未提出のまま。
    const user = userEvent.setup();
    const student = await addKid(1);
    const kanji = await addType("かんじドリル");
    await addType("さんすうプリント");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);

    await waitFor(async () => {
      const recorded = await listSubmissions(cohortId, TODAY_KEY);
      expect(recorded).toHaveLength(1);
      expect(recorded[0].submissionTypeId).toBe(kanji.id);
    });
  });

  it("花丸と番号を出す", async () => {
    const user = userEvent.setup();
    const student = await addKid(7);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);

    expect(await screen.findByText("7番")).toBeInTheDocument();
  });

  it("記録したあと選択が空に戻る", async () => {
    // 前の子の選択が次の子に引き継がれないこと
    const user = userEvent.setup();
    const student = await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /かんじドリル/ }),
      ).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("次の子が選び始めると前の結果が消える", async () => {
    const user = userEvent.setup();
    const student = await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);
    await screen.findByText("1番");

    await user.click(screen.getByRole("button", { name: /かんじドリル/ }));

    await waitFor(() => {
      expect(screen.queryByText("1番")).not.toBeInTheDocument();
    });
  });

  it("このアプリのQRでなければ黙って無視する", async () => {
    const user = userEvent.setup();
    await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await act(async () => {
      camera.onScan?.("4901234567894");
    });

    expect(await listSubmissions(cohortId, TODAY_KEY)).toHaveLength(0);
    expect(
      screen.queryByText("このクラスの生徒ではありません"),
    ).not.toBeInTheDocument();
  });
});

describe("子供に見せないもの", () => {
  beforeEach(async () => {
    await addType("かんじドリル");
  });

  it("名簿へのリンクを出さない", async () => {
    renderKids();
    await screen.findByRole("button", { name: /かんじドリル/ });

    expect(
      screen.queryByRole("link", { name: "名簿へ" }),
    ).not.toBeInTheDocument();
  });

  it("番号でチェックへ切り替えられない", async () => {
    renderKids();
    await screen.findByRole("button", { name: /かんじドリル/ });

    expect(
      screen.queryByRole("button", { name: "番号でチェック" }),
    ).not.toBeInTheDocument();
  });

  it("クラス全体の進捗を出さない", async () => {
    renderKids();
    await screen.findByRole("button", { name: /かんじドリル/ });

    expect(screen.queryByText(/かんじドリル \d+人/)).not.toBeInTheDocument();
  });

  it("先生への入口はある", async () => {
    renderKids();

    expect(await screen.findByRole("link", { name: "せんせい" })).toHaveAttribute(
      "href",
      "/roster",
    );
  });
});

describe("出せるものが無いとき", () => {
  it("提出物が未登録なら設定へ誘わない", async () => {
    renderKids();

    expect(
      await screen.findByText("きょうは だすものが ありません"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "提出物の設定" }),
    ).not.toBeInTheDocument();
  });

  it("今日が提出日でなければ同じことを伝える", async () => {
    await addType("かんじドリル", [(TODAY_WEEKDAY + 1) % 7]);
    renderKids();

    expect(
      await screen.findByText("きょうは だすものが ありません"),
    ).toBeInTheDocument();
  });
});

describe("カメラが使えないとき", () => {
  it("番号でチェックとは言わず、先生を呼ばせる", async () => {
    // useQrCamera の文言は「番号でチェックしてください」と促すが、
    // 児童画面に番号パッドは無い。子供に打つ手が無い指示を出さない。
    camera.state = "denied";
    camera.message =
      "カメラを使えません。端末の設定で許可するか、番号でチェックしてください";

    const user = userEvent.setup();
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );

    expect(
      await screen.findByText("せんせいを よんでください"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/番号でチェック/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/screens/KidsScan.test.tsx`
Expected: FAIL（`Failed to resolve import "./KidsScan"`）

- [ ] **Step 3: 実装する**

`src/screens/KidsScan.tsx`:

```tsx
import { useRef, useState } from "react";
import { Link } from "react-router";
import { CameraView } from "../components/CameraView";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { ScanResult } from "../components/ScanResult";
import { SubmissionToggleBar } from "../components/SubmissionToggleBar";
import { recordSubmission, type RecordResult } from "../db/submissions";
import { isDueOn } from "../db/submissionTypes";
import { useQrCamera } from "../hooks/useQrCamera";
import { useSubmissionTypes } from "../hooks/useSubmissionTypes";
import { formatDateHeading, toDateKey } from "../lib/date";
import { parseQrPayload } from "../lib/qr";

/**
 * 子供が自分でQRをかざす画面。
 *
 * 教員用スキャン（Scan.tsx）との違いは5点。どれも「子供が触る」ことから来る。
 * 1. 提出物の初期選択が空（教員用は今日の分すべて）。何も考えずかざした子が
 *    出していない宿題まで提出済みになるのを防ぐ
 * 2. 記録したら選択を空に戻す。前の子の選択が次の子に引き継がれない
 * 3. 選び始めたら前の結果を消す。誰の花丸か分からなくならないように
 * 4. 番号パッドを出さない。他人の番号を押せてしまう
 * 5. クラス全体の進捗を出さない。それは教員の情報
 *
 * 生徒一覧を読まないのは、番号パッドが無く、生徒の存在確認は
 * recordSubmission が行うため（notFound / transferredOut を返す）。
 */
function KidsScanBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の日付で固定する（Scan.tsx と同じ理由）。
  const [today] = useState(() => new Date());
  const date = toDateKey(today);

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

  const todayTypes = types.data
    .filter((type) => type.status === "active")
    .filter((type) => isDueOn(type, date));

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
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <h1 className="font-display text-ai text-2xl">
          {formatDateHeading(today)}
        </h1>
        {/* 先生の入口。目立たせないが、44px四方のタップ領域は確保する */}
        <Link
          to="/roster"
          className="text-sumi flex size-11 shrink-0 items-center justify-center text-sm"
        >
          せんせい
        </Link>
      </header>

      {todayTypes.length === 0 ? (
        <p className="py-12 text-center text-xl">
          きょうは だすものが ありません
        </p>
      ) : (
        <>
          <SubmissionToggleBar
            types={todayTypes}
            selectedIds={selectedIds}
            onToggle={toggle}
          />

          <ScanResult result={result} />

          {selectedIds.length === 0 ? (
            <p className="py-8 text-center text-xl font-bold">
              だしたものを えらんでね
            </p>
          ) : cameraUsable ? (
            <CameraView
              state={camera.state}
              message={camera.message}
              videoRef={camera.videoRef}
              canvasRef={camera.canvasRef}
            />
          ) : (
            // useQrCamera の文言は「番号でチェックしてください」と促すが、
            // この画面に番号パッドは無い。子供に打つ手が無い指示を出さない。
            <p className="py-8 text-center text-xl font-bold">
              せんせいを よんでください
            </p>
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
Expected: PASS（16件）

- [ ] **Step 5: わざと壊して、テストが守っていることを確認する**

4つ試す。それぞれ想定のテストが落ちること。確認したら元に戻す。

1. `useState<string[]>([])` を `useState<string[]>(() => todayTypes.map((type) => type.id))` 相当の初期全選択にする（`todayTypes` の定義位置より後ろに移す必要がある） → 「最初は何も選ばれていない」が落ちる
2. `.then` の `setSelectedIds([])` を削る → 「記録したあと選択が空に戻る」が落ちる
3. `handleScan` の `if (selectedIds.length === 0) return;` を削る → 「何も選んでいなければ記録しない」が落ちる
4. `toggle` の `setResult(null)` を削る → 「次の子が選び始めると前の結果が消える」が落ちる

- [ ] **Step 6: コミット**

```bash
git add src/screens/KidsScan.tsx src/screens/KidsScan.test.tsx
git commit -m "feat: 子供が自分でスキャンする児童画面を追加"
```

---

### Task 9: ルートに組み込み、既存テストを移行する

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/AppHeader.tsx`
- Create: `src/test/router.tsx`
- Modify: `src/screens/Home.test.tsx`
- Modify: 既存テスト11件（`Print` `Calendar` `Roster` `Settings` `Scan` `StudentEdit` `StudentNew` `SubmissionList` `SubmissionNew` `SubmissionEdit` `Unsubmitted`）

**Interfaces:**
- Consumes: `TeacherGate`（Task 7）、`TeacherAuthProvider` と `TeacherAuthContext`（Task 3）、`KidsScan`（Task 8）
- Produces: `renderAsTeacher(path: string): RenderResult`（`src/test/router.tsx`）

**このタスクはガードの追加と既存テストの移行を必ず一緒に行う。** 分けると赤いままコミットすることになる。

- [ ] **Step 1: 現状の全テストが緑であることを確認する**

Run: `npm run test:run`
Expected: PASS。ここが起点になる。落ちているものがあれば先に報告すること。

- [ ] **Step 2: テストヘルパーを作る**

`src/test/router.tsx`:

```tsx
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "../App";
import { TeacherAuthContext } from "../components/TeacherAuthProvider";

/**
 * 認証済みの状態で教員ルートを開く。
 *
 * Provider ではなく Context に直接値を与える。本番の
 * TeacherAuthProvider に認証を素通りさせる prop を持たせないため。
 */
export function renderAsTeacher(path: string): RenderResult {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TeacherAuthContext
        value={{ authenticated: true, signIn: () => {}, signOut: () => {} }}
      >
        <AppRoutes />
      </TeacherAuthContext>
    </MemoryRouter>,
  );
}
```

- [ ] **Step 3: 失敗するテストを書く（ルート構成）**

`src/screens/Home.test.tsx` を書き直す。現在は「`/` を開くとスキャン画面が出る」を検証しているが、`/` は児童画面になる。

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { TeacherAuthProvider } from "../components/TeacherAuthProvider";
import { createCohort } from "../db/cohorts";
import { addSubmissionType } from "../db/submissionTypes";

useFreshDb();

const TODAY = new Date();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TeacherAuthProvider>
        <AppRoutes />
      </TeacherAuthProvider>
    </MemoryRouter>,
  );
}

describe("入口", () => {
  it("/ は児童画面", async () => {
    await addSubmissionType({
      cohortId,
      name: "けいさんドリル",
      deadline: "08:15",
      weekdays: [TODAY.getDay()],
    });

    renderAt("/");

    expect(
      await screen.findByRole("link", { name: "せんせい" }),
    ).toBeInTheDocument();
  });

  it("知らないパスは児童画面へ送る", async () => {
    await addSubmissionType({
      cohortId,
      name: "けいさんドリル",
      deadline: "08:15",
      weekdays: [TODAY.getDay()],
    });

    renderAt("/unknown");

    expect(
      await screen.findByRole("link", { name: "せんせい" }),
    ).toBeInTheDocument();
  });

  it("提出物が無くても行き止まりにしない", async () => {
    renderAt("/");

    expect(
      await screen.findByText("きょうは だすものが ありません"),
    ).toBeInTheDocument();
  });
});

describe("教員ルートの守り", () => {
  it("認証していなければ名簿を開けない", async () => {
    renderAt("/roster");

    // パスワード未設定なので設定画面が出る。名簿は出ない。
    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });

  it("認証していなければ集計を開けない", async () => {
    renderAt("/unsubmitted");

    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });

  it("認証していなければ設定を開けない", async () => {
    renderAt("/settings");

    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });

  it("/setup は守らない（クラスもパスワードも無い状態で通る道）", async () => {
    // cohort があるので SetupGate が /roster へ送り、そこでガードが働く
    renderAt("/setup");

    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: テストが落ちることを確認する**

Run: `npx vitest run src/screens/Home.test.tsx`
Expected: FAIL（`/` がまだ児童画面ではなく、ガードも無い）

- [ ] **Step 5: App.tsx を書き換える**

```tsx
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { SetupGate } from "./components/SetupGate";
import { TeacherAuthProvider } from "./components/TeacherAuthProvider";
import { TeacherGate } from "./components/TeacherGate";
import { Calendar } from "./screens/Calendar";
import { KidsScan } from "./screens/KidsScan";
import { Print } from "./screens/Print";
import { Roster } from "./screens/Roster";
import { UpdateBanner } from "./components/UpdateBanner";
import { Scan } from "./screens/Scan";
import { Settings } from "./screens/Settings";
import { SubmissionEdit } from "./screens/SubmissionEdit";
import { SubmissionList } from "./screens/SubmissionList";
import { SubmissionNew } from "./screens/SubmissionNew";
import { Setup } from "./screens/Setup";
import { StudentEdit } from "./screens/StudentEdit";
import { StudentNew } from "./screens/StudentNew";
import { Unsubmitted } from "./screens/Unsubmitted";

export function AppRoutes() {
  return (
    <Routes>
      {/* 児童画面。鍵をかけない入口 */}
      <Route path="/" element={<KidsScan />} />

      {/*
        初期設定は鍵の外に置く。クラスもパスワードもまだ無い状態で開く画面のため。
        既存の SetupGate が、cohortがあるときは /roster へ送るので、
        子供がここを開いても名簿には届かない（/roster 側でガードが働く）。
      */}
      <Route
        path="/setup"
        element={
          <SetupGate>
            <Setup />
          </SetupGate>
        }
      />

      {/* ここから下はすべて教員用 */}
      <Route
        element={
          <TeacherGate>
            <Outlet />
          </TeacherGate>
        }
      >
        <Route path="/roster" element={<Roster />} />
        <Route path="/roster/new" element={<StudentNew />} />
        <Route path="/roster/:id/edit" element={<StudentEdit />} />
        <Route path="/print" element={<Print />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/submissions" element={<SubmissionList />} />
        <Route path="/submissions/new" element={<SubmissionNew />} />
        <Route path="/submissions/:id/edit" element={<SubmissionEdit />} />
        <Route path="/unsubmitted" element={<Unsubmitted />} />
        <Route path="/calendar" element={<Calendar />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <TeacherAuthProvider>
        <AppRoutes />
        <UpdateBanner />
      </TeacherAuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Home.test.tsx が通ることを確認する**

Run: `npx vitest run src/screens/Home.test.tsx`
Expected: PASS（7件）

- [ ] **Step 7: 壊れた既存テストの数を数える**

Run: `npm run test:run`
Expected: FAIL。教員ルートを開く11ファイルが落ちる。落ちたファイル名を控える。

- [ ] **Step 8: 既存テスト11件を移行する**

各ファイルの、`AppRoutes` を `MemoryRouter` で包んでいる `render` 呼び出しを `renderAsTeacher(path)` に置き換える。ローカルの `renderXxx()` ヘルパーがある場合は、その中身だけ差し替えると変更が1箇所で済む。

置き換え前（例: `src/screens/Roster.test.tsx`）:

```tsx
render(
  <MemoryRouter initialEntries={["/roster"]}>
    <AppRoutes />
  </MemoryRouter>,
);
```

置き換え後:

```tsx
renderAsTeacher("/roster");
```

不要になった `MemoryRouter` と `AppRoutes` の import を消すこと（`noUnusedLocals: true` でビルドが落ちる）。`render` を他でも使っているファイルでは `render` の import は残す。

対象: `Print` `Calendar` `Roster` `Settings` `Scan` `StudentEdit` `StudentNew` `SubmissionList` `SubmissionNew` `SubmissionEdit` `Unsubmitted`。`Setup.test.tsx` と `SetupGuard.test.tsx` は `/setup` を開くので触らない。`SettingsSaveFailure.test.tsx` と `SettingsRestoreFailure.test.tsx` は画面コンポーネントを直接レンダーしているので触らない（Step 7 で落ちていなければそのまま）。

- [ ] **Step 9: 全テストが緑に戻ることを確認する**

Run: `npm run test:run`
Expected: PASS

- [ ] **Step 10: AppHeader に児童画面へ戻る導線を足す（テストから）**

`src/components/AppHeader.test.tsx` を新規に作る:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";
import { TeacherAuthContext } from "./TeacherAuthProvider";

const COHORT = {
  id: "c1",
  year: 2026,
  className: "5年1組",
  isActive: true,
  createdAt: 0,
};

function renderHeader(signOut: () => void) {
  return render(
    <MemoryRouter>
      <TeacherAuthContext
        value={{ authenticated: true, signIn: () => {}, signOut }}
      >
        <AppHeader cohort={COHORT} subtitle="34人" />
      </TeacherAuthContext>
    </MemoryRouter>,
  );
}

describe("AppHeader", () => {
  it("児童画面に戻ると認証を捨てる", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn();
    renderHeader(signOut);

    await user.click(screen.getByRole("button", { name: "児童画面に戻る" }));

    expect(signOut).toHaveBeenCalledOnce();
  });
});
```

Run: `npx vitest run src/components/AppHeader.test.tsx`
Expected: FAIL（ボタンがまだ無い）

- [ ] **Step 11: AppHeader を実装する**

`src/components/AppHeader.tsx` に追加する。`useNavigate` と `useTeacherAuth` を使い、押したら `signOut()` してから `/` へ送る。

```tsx
import { Link, useNavigate } from "react-router";
import type { Cohort } from "../db/schema";
import { useTeacherAuth } from "./TeacherAuthProvider";

export function AppHeader({
  cohort,
  subtitle,
}: {
  cohort: Cohort;
  subtitle: string;
}) {
  const navigate = useNavigate();
  const { signOut } = useTeacherAuth();

  return (
    <header className="border-kogan flex items-start justify-between gap-3 border-b pb-3">
      <div>
        <h1 className="font-display text-ai text-2xl">
          {cohort.year}年度 {cohort.className}
        </h1>
        <p className="mt-1 text-sm">{subtitle}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/*
          子供に端末を渡す前に押す。認証を捨ててから移るので、
          ブラウザの戻るボタンで戻っても TeacherGate が守る。
        */}
        <button
          type="button"
          onClick={() => {
            signOut();
            void navigate("/");
          }}
          className="text-ai min-h-11 px-2 text-sm font-bold underline"
        >
          児童画面に戻る
        </button>

        {/* タブレットを片手で持って押すため、44px四方のタップ領域を確保する */}
        <Link
          to="/settings"
          aria-label="設定"
          className="text-ai flex size-11 shrink-0 items-center justify-center text-xl"
        >
          ⚙
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 12: 全テストが通ることを確認する**

Run: `npm run test:run`
Expected: PASS

`AppHeader` が `useTeacherAuth` を使うようになったため、`AppHeader` を含む画面を Provider 無しでレンダーしているテストがあれば落ちる。落ちたら `renderAsTeacher` に寄せる。

- [ ] **Step 13: ビルドが通ることを確認する**

Run: `npm run build`
Expected: 成功（`tsc --noEmit` を含む。未使用importがあればここで落ちる）

- [ ] **Step 14: わざと壊して、ガードが効いていることを確認する**

`App.tsx` の `<TeacherGate>` を外して `<Outlet />` だけにする。`Home.test.tsx` の「教員ルートの守り」3件が落ちること。**1件でも通るなら、そのテストは守れていない。** 確認したら元に戻す。

- [ ] **Step 15: コミット**

```bash
git add -A
git commit -m "feat: 教員ルートをパスワードで守り、/ を児童画面にする"
```

---

### Task 10: ブラウザバックで戻れないことを確かめる

**Files:**
- Test: `src/screens/TeacherAccess.test.tsx`（新規）

**Interfaces:**
- Consumes: `renderAsTeacher` は使わない（認証の遷移そのものを見るため）。`AppRoutes`、`TeacherAuthProvider`、`setTeacherPassword`

塞ぎ忘れやすい経路を、独立したファイルで明示的に検証する。

- [ ] **Step 1: 失敗するテストを書く**

`src/screens/TeacherAccess.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { TeacherAuthProvider } from "../components/TeacherAuthProvider";
import { createCohort } from "../db/cohorts";
import { setTeacherPassword } from "../db/teacherAuth";

useFreshDb();

beforeEach(async () => {
  await createCohort({ year: 2026, className: "5年1組" });
  await setTeacherPassword("あさのかい");
});

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/roster"]}>
      <TeacherAuthProvider>
        <AppRoutes />
      </TeacherAuthProvider>
    </MemoryRouter>,
  );
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("パスワード"), "あさのかい");
  await user.click(screen.getByRole("button", { name: "入る" }));
}

describe("児童画面に戻ったあと", () => {
  it("もう一度名簿を開くとパスワードを求められる", async () => {
    const user = userEvent.setup();
    renderApp();

    await signIn(user);
    await screen.findByRole("button", { name: "児童画面に戻る" });

    await user.click(screen.getByRole("button", { name: "児童画面に戻る" }));
    await screen.findByRole("link", { name: "せんせい" });

    // 児童画面の「せんせい」から名簿へ戻る = ブラウザバックと同じ到達経路
    await user.click(screen.getByRole("link", { name: "せんせい" }));

    expect(await screen.findByLabelText("パスワード")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "児童画面に戻る" }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行する**

Run: `npx vitest run src/screens/TeacherAccess.test.tsx`
Expected: PASS（Task 9 の実装で既に満たされているはず）

**もし落ちたら、それは実装の穴を見つけたということ。** `signOut()` が呼ばれていないか、`AppHeader` の遷移先が違う。報告してから直すこと。

- [ ] **Step 3: わざと壊して、テストが守っていることを確認する**

`AppHeader` の `signOut()` の呼び出しを消す。このテストが落ちること。確認したら元に戻す。

- [ ] **Step 4: コミット**

```bash
git add src/screens/TeacherAccess.test.tsx
git commit -m "test: 児童画面に戻ったあと教員ルートが守られることを検証"
```

---

### Task 11: 制約の機械的な検査と確認手順の追記

**Files:**
- Modify: `docs/手元での確認手順.md`

- [ ] **Step 1: 制約違反を機械的に検査する**

CLAUDE.md の「実装後に制約違反を機械的に検査する」に従う。今回追加したファイルを対象に実行し、ヒットがあれば直す。

```bash
# 朱は花丸と、元へ戻せない操作の確認ダイアログだけ。新規ファイルに出てはいけない
grep -rn "shu" src/screens/Teacher*.tsx src/screens/KidsScan.tsx src/components/Teacher*.tsx src/components/PassphraseNotice.tsx

# Tailwind素のカラーを使っていないこと
grep -rnE "(text|bg|border)-(white|black|gray|red|blue|green|slate|zinc|neutral)" src/

# any を使っていないこと
grep -rn ": any\|as any" src/

# 44px未満のタップ領域が無いこと（min-h-11 か size-11 が付いているか目視）
grep -n "button\|<Link" src/screens/KidsScan.tsx src/screens/TeacherLogin.tsx src/screens/TeacherPasswordSetup.tsx src/components/PassphraseNotice.tsx
```

- [ ] **Step 2: 全テストとビルドを通す**

Run: `npm run test:run && npm run build`
Expected: 両方成功

- [ ] **Step 3: 確認手順に項目を足す**

`docs/手元での確認手順.md` に追記する（既存の書式に合わせること）。人の目でしか確かめられないものだけを書く。

```markdown
## 児童用ページと教員用ページの分離

- [ ] 初期設定（クラス作成とパスワード設定）を終えるまで端末を子供に渡さない。
      パスワードを決めるまでは、誰でも設定画面にたどり着ける
- [ ] 合言葉を紙に控えて保管する。控えないまま画面を閉じると二度と表示できない
- [ ] 児童画面の「せんせい」を押すと、名簿ではなくパスワード入力が出る
- [ ] 教員画面から「児童画面に戻る」を押したあと、ブラウザの戻るボタンで
      名簿に戻れない
- [ ] アプリを再起動すると、もう一度パスワードを求められる
- [ ] 提出物を選ばずにQRをかざしても、花丸が出ず記録もされない
- [ ] 1人スキャンしたあと、提出物の選択が外れている（次の子が選び直す）
- [ ] 児童が実際にかざす高さ・距離でカメラが読み取れる。
      教室に据え置く場合、先生が手に持つ場合と画角の条件が変わる
- [ ] 375px幅の端末で児童画面が崩れない
- [ ] パスワードを忘れた状態から、合言葉だけで復旧できる（通しで一度やる）
```

- [ ] **Step 4: コミット**

```bash
git add docs/手元での確認手順.md
git commit -m "docs: 児童用・教員用の分離について確認手順を追記"
```

---

## 完了の条件

- `npm run test:run` が緑
- `npm run build` が成功
- Task 1〜10 の「わざと壊す」確認をすべて実施した
- `docs/手元での確認手順.md` に実機確認の項目がある

## 実装中に見つかったら報告すること

- `src/db/teacherAuth.test.ts` の実行が10秒を超える（PBKDF2 の反復回数を下げる判断が要る）
- `recordSubmission` が `notFound` を返す条件が Task 8 の想定と違う
- `CameraView` が教員向けの文言を持っており、児童画面でそのまま出ると子供に意味が通らない
- Task 9 の Step 7 で、想定した11ファイル以外が落ちる
