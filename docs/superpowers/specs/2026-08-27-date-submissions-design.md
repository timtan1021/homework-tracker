# 日付指定の提出物（カレンダー登録） 設計書

作成日: 2026-08-27

## 1. 目的

提出物マスタは現在「曜日繰り返し」（例: 毎週月〜金の08:15）でしか登録できない。実際の運用では、毎週固定の宿題は少なく、前日までに「明日は計算プリントp23」のように**日付ごとに宿題名を決めて登録する**ほうが実態に近い。この設計は、既存の曜日繰り返しモデルを維持したまま、**日付を指定して1回だけ有効な提出物**を登録できる新しいカレンダー画面を追加する。

## 2. 背景・前提（すでに合意済みの決定）

- 曜日繰り返しモデルは廃止せず、両方を共存させる
- 日付指定は「前日までにまとめて登録」する運用を想定し、当日朝の即興入力は主目的にしない
- 入力は**週単位の縦並びリスト**（前週・次週で移動）。月グリッドは375px幅で1マスが狭すぎるため採用しない
- 締切時刻は日付指定の項目すべてで共通の1つの値を使う。値は設定画面で変更できる
- 1日1件が基本。多い日は2〜3件程度まで
- 取り消しは完全削除のみ（曜日繰り返しの「終了にする」のような履歴保持は不要）
- 既存の「提出物の設定」一覧画面（`/submissions`）には出さない。カレンダー画面だけで登録・確認・修正が完結する

## 3. データ層

### 3.1 新しいストアは作らない — `SubmissionType` に `date` を追加するだけ

判別可能ユニオンでの再構築は行わない。既存の `weekdays: number[]` は変更せず、**任意フィールド `date?: string` を追加するだけ**にする。これは欠席機能（`Submission.status?`）と同じ「フィールド追加のみ」パターンで、既存レコードとの後方互換性が自動的に成り立つ（既存のレコードは全て曜日繰り返しであり、`date` を持たない＝`undefined`＝曜日繰り返し、という解釈と完全に一致する）。

```ts
export type SubmissionType = {
  id: string;
  cohortId: string;
  name: string;
  deadline: string;
  /** 曜日繰り返しの場合の対象曜日。日付指定の場合は使わない([]を入れる)。 */
  weekdays: number[];
  /** 日付指定の場合の対象日("YYYY-MM-DD")。曜日繰り返しの場合は無い。 */
  date?: string;
  status: SubmissionStatus;
  order: number;
  createdAt: number;
};
```

**DB_VERSIONは上げない。マイグレーションも無い。**

この方式が判別可能ユニオンより優れている点: `addSubmissionType` / `updateSubmissionType` / `moveSubmissionType` / `SubmissionForm.tsx` / `SubmissionEdit.tsx` / `SubmissionNew.tsx` は、`date` フィールドの存在を一切知らないまま**無変更で動き続ける**。曜日繰り返し側のコードパスに一切触れない。

### 3.2 「今日が提出日か」の判定を1箇所にまとめる

現在、この判定は3箇所に重複している: `Scan.tsx`（`today.getDay()` から直接）、`nonSubmitters.ts` の `listTodayNonSubmitters`、`nonSubmitters.ts` の `countRecentNonSubmissions`（いずれも `weekdayOfDateKey(date)` から）。3箇所とも `type.weekdays.includes(weekday)` を直接書いており、日付指定の分岐を持ち込むと3箇所とも書き換えが必要になる。共通ヘルパーを1つ作り、3箇所ともこれを呼ぶ形に統一する。

`src/db/submissionTypes.ts` に追加:
```ts
/** 対象日にこの提出物が提出日かどうかを判定する。 */
export function isDueOn(type: SubmissionType, dateKey: string): boolean {
  if (type.date !== undefined) {
    return type.date === dateKey;
  }
  return type.weekdays.includes(weekdayOfDateKey(dateKey));
}
```
(`weekdayOfDateKey` を `../lib/date` からimportする。)

**変更が必要な3箇所:**
- `src/screens/Scan.tsx`: `todayTypes = activeTypes.filter((type) => type.weekdays.includes(today.getDay()))` → `activeTypes.filter((type) => isDueOn(type, date))`（`date` は既に `toDateKey(today)` として計算済みの変数を使う）
- `src/db/nonSubmitters.ts` の `listTodayNonSubmitters`: `types.filter((type) => type.status === "active" && type.weekdays.includes(weekday))` → `type.status === "active" && isDueOn(type, date)`
- `src/db/nonSubmitters.ts` の `countRecentNonSubmissions`: `if (!type.weekdays.includes(weekday)) continue;` → `if (!isDueOn(type, date)) continue;`（`createdAt` ガード・締切ガードはそのまま両方の種類に等しく適用する。日付指定の項目も「登録前の日付は数えない」という同じ理屈が成り立つ）

### 3.3 `/submissions` 一覧から日付指定の項目を除外する

`listSubmissionTypes` 自体はフィルタしない（`Scan.tsx`・`nonSubmitters.ts` は日付指定の項目も見る必要があるため）。**画面側でフィルタする。**

`src/screens/SubmissionList.tsx:20` の直後に1行追加:
```ts
const list = types.data.filter((type) => type.date === undefined);
```

`src/db/submissionTypes.ts` の `moveSubmissionType` の兄弟探索（`siblings` を作る `.filter(...)`）にも `type.date === undefined` を加える。UIからは日付指定の項目に対して並べ替えボタンが出ないため実際には到達しないが、データ層だけを使う経路でも壊れないようにする既存の設計方針（`moveSubmissionType` 冒頭のコメント）に倣う。

### 3.4 日付指定専用のCRUD — 新規 `src/db/dateSubmissions.ts`

既存の `assertNameIsFree`（クラス内で同じ名前を1つしか許さない）を日付指定の項目に適用すると、「計算プリント」を複数の日に登録できなくなってしまう（宿題名の使い回しは普通）。そのため `addSubmissionType` は流用せず、専用の検証を持つ新しいモジュールを作る。

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

/** 対象週(7日ぶんの日付キー)に登録済みの日付指定項目を、日付・登録順で返す。 */
export async function listDateSubmissionsInWeek(
  cohortId: string,
  weekDates: string[],
): Promise<SubmissionType[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("submissionTypes", "by-cohort", cohortId);
  const weekSet = new Set(weekDates);

  return all
    .filter((type) => type.date !== undefined && weekSet.has(type.date))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.createdAt - b.createdAt);
}
```

`order: 0` は固定値でよい（日付指定の項目は並べ替えUIに出ないため、並べ替え操作の対象にはならない）。ただし `listSubmissionTypes` は曜日繰り返し・日付指定を区別せず `order` 昇順で返すため、`order: 0` の日付指定項目は曜日繰り返し（`order` は1以上）より常に先頭に来る。この並び順を消費するのは `Scan.tsx` の切替バーと未提出者一覧・集計画面のみで、「提出物の設定」画面自体は日付指定項目を表示前に除外するため影響を受けない。見た目上の並び順の癖であり、機能上の不具合ではない。

### 3.5 共通締切時刻の設定

既存の `src/db/settings.ts` はbooleanの設定しか扱えない（`SETTING_DEFAULTS` の値型が `boolean` 固定、`getSetting`/`setSetting`/`useSetting` も同様）。既存の2つの設定（`showStudentNames`・`rosterHintDismissed`）を汎用化するより、**この1つの文字列設定のためだけの専用関数を素直に追加する**ほうが変更が小さく、既存の設定に触れるリスクも無い。

`src/db/settings.ts` に追加（既存のboolean専用コードには一切触れない）:
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

同じ `settings` ストア（キーバリュー、スキーマレス）を使うため、ここでもマイグレーション不要。

### 3.6 週の日付計算 — `src/lib/date.ts` への追加

```ts
/** dateKey を含む週の日曜日を返す("YYYY-MM-DD")。 */
export function startOfWeek(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - date.getDay());
  return toDateKey(date);
}

/** startDate から7日分の日付キーを、古い順に返す。 */
export function weekDates(startDate: string): string[] {
  const [year, month, day] = startDate.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  return Array.from({ length: 7 }, (_, i) => {
    const current = new Date(start);
    current.setDate(current.getDate() + i);
    return toDateKey(current);
  });
}
```

週の始まりは日曜日固定とする（`Date.getDay()` の0始まりとそのまま対応し、曜日計算が単純になる）。

## 4. 画面

### 4.1 新規 `src/screens/Calendar.tsx`、ルート `/calendar`

既存の `CohortGate` パターンを踏襲する（`Unsubmitted.tsx` と同じ構造）。

```
┌─────────────────────────┐
│ [名簿へ]                  │
│  ← 前週      8/24〜8/30   次週 →  │
├─────────────────────────┤
│ 8/24(月)                  │
│  [計算プリントp23     ✕]  │
│                           │
│ 8/25(火)                  │
│  （タップして登録）         │
│                           │
│ 8/26(水)                  │
│  [漢字ドリル          ✕]  │
│  [＋もう1件]               │
└─────────────────────────┘
```

- 週の状態は `weekStart` の1つの `useState`（初期値 `startOfWeek(toDateKey(new Date()))`）。前週・次週ボタンは `weekStart` を±7日する
- `listDateSubmissionsInWeek(cohortId, weekDates(weekStart))` で対象週の登録済み項目を取得し、`date` ごとにグループ化して表示
- 未登録の日は「（タップして登録）」の1行。タップすると、その場でテキスト入力（自動フォーカス）に変わる。Enterまたはフォーカスを外すと `addDefaultDeadline()`（3.5）で取得した締切時刻を使って `addDateSubmission` を呼ぶ
- 登録済みの項目は名前を表示し、タップすると同じくインライン編集（`updateDateSubmissionName`）。空文字にして確定すると「宿題の名前を入力してください」のエラーを見せて確定させない（既存の `assertValidName` と同じ文言）
- 各登録済み項目の右に「✕」。タップで `ConfirmDialog`（`tone="normal"` — 取り消しは完全削除のみという運用上の決定はあるが、誤操作防止のための軽い確認は残す。朱は使わない）を出し、確定で `deleteDateSubmission`
- 1日に1件登録済みの状態でだけ「＋もう1件」を表示し、タップで2件目のインライン入力を開く。既存が0件のときは「（タップして登録）」自体が1件目の入力を兼ねる

### 4.2 設定画面への追加

`src/screens/Settings.tsx` に、既存の氏名表示チェックボックスと同じ並びで、`type="time"` の入力を1つ追加する。`SubmissionForm.tsx` の締切時刻入力（`className="border-ai font-num w-40 rounded border-2 px-3 py-2 text-2xl"`）と同じスタイルを流用する。専用の `useDefaultDeadline`（`useSetting` とは別の、この値専用のフック）を新設し、`getDefaultDeadline`/`setDefaultDeadline` をラップする。

### 4.3 名簿画面からの導線

`src/screens/Roster.tsx` の下部ナビに、既存の「未提出者・集計を見る」と同じ見た目の全幅ボタンをもう1行追加する:
```tsx
<Link
  to="/calendar"
  className="border-ai text-ai rounded border-2 px-4 py-3 text-center font-bold"
>
  宿題をカレンダーで登録
</Link>
```
これで下部ナビは4行構成になる（生徒を追加／QRを印刷・提出物の設定／未提出者・集計を見る／宿題をカレンダーで登録）。

### 4.4 ルート追加

`src/App.tsx` に `<Route path="/calendar" element={<Calendar />} />` を追加する。`/calendar/new` や `/calendar/:id/edit` は作らない（登録・編集・削除はすべてカレンダー画面内のインライン操作で完結するため、別画面への遷移は不要）。

## 5. テスト方針

`docs/superpowers/specs/2026-08-27-absence-marking-design.md` と同じ既存方針を継承する。`vi.useFakeTimers` は使わない。日付に依存するテストは実際の今日から相対的に組み立てる。

破壊試験の対象:
- `isDueOn`: 曜日繰り返しの項目に `date` が無いことを前提にした分岐を外すと、日付指定の項目が曜日判定に紛れ込むことを確認
- `addDateSubmission`/`updateDateSubmissionName` の名前検証を外すと、空文字での登録・更新が通ってしまうことを確認
- `SubmissionList.tsx` の `date === undefined` フィルタを外すと、日付指定の項目が曜日繰り返しの一覧に混ざって出てしまうことを確認

## 6. 対象外（YAGNI）

- **日付指定項目の「終了」状態**は作らない。完全削除のみ（3節冒頭で確認済み）
- **1日に3件を超える登録の専用UI**は作らない。「＋もう1件」を繰り返し押せば技術的には何件でも登録できるが、専用の見た目や上限チェックは持たない
- **月表示・過去の週への無制限な遡り**は作らない。前週・次週の移動のみ
- **日付指定項目ごとの個別締切時刻**は作らない。設定画面の共通値のみ
- **`/submissions` 一覧画面への統合表示**は作らない（4.1で確認済み。カレンダー画面だけで完結する）
