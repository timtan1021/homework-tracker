# ステップ4: 未提出者一覧・集計 設計書

## 目的

宿題提出管理アプリの最後の未着手ステップ。「未提出者一覧・集計・自動未提出確定」を実装する。

先生は締切前後どちらでもこの画面を使う。締切前は「まだ来ていない子」を把握して回収を急ぐために、締切後は「今日結局出さなかった子」を確定させるために使う。加えて、直近2週間で未提出が多い生徒を見つける集計を載せ、保護者面談や声かけの優先度づけに使えるようにする。

## 設計判断

### 新しいストアは作らない

既存の設計判断「未提出のレコードは作らない。『記録が無い＝未提出』で表す」（CLAUDE.md）をそのまま踏襲する。「自動未提出確定」は、DBに何かを書き込むのではなく、**表示のたびに計算する**。

理由:
- DBスキーマ変更もマイグレーションも不要になり、リスクが小さい
- 「記録が無い＝未提出」という一貫した解釈をこの機能でも崩さない
- 締切を過ぎているかどうかは日付と時刻から常に計算し直せる情報であり、キャッシュする理由がない

### 締切前後の区別

同じ未提出者一覧が、時間経過で意味を変える。締切前に表示されるグループは「まだ提出時間内」（急かす対象）、締切を過ぎたグループは「確定した未提出」（今日はもう出ない）。この区別は `date`（対象日）と `deadline`（提出物ごとの締切時刻）と `now`（現在時刻）の3つから毎回計算する。

過去の日付は常に「締切を過ぎている」として扱う（今日より前の日は、どんな締切時刻であっても既に過ぎている）。

### 集計対象は現在アクティブな提出物のみ

終了した提出物は、過去に何回か未提出があったとしても直近2週間の集計には含めない。理由: この集計は「今週・来週、誰に声をかけるか」を先生が判断するためのものであり、もう存在しない提出物について声をかける意味がないため。

この設計は、提出物の状態変更履歴を保持しない現在のデータモデル（`SubmissionType.status` は現在の状態のみを持つ）とも整合する。提出物がアクティブだった期間だけを正確に遡って集計する仕組みは持たない。

### 対象は在籍中の生徒・アクティブな提出物のみ

Scan画面（`src/screens/Scan.tsx`）と同じ絞り込みを踏襲する。転出した生徒（`status === "transferredOut"`）は一覧にも集計にも出さない。

## データ層

### `src/lib/date.ts` への追加

```ts
/**
 * 対象日の締切を、現在時刻の時点で過ぎているか判定する。
 *
 * 過去の日付は常にtrue（どんな締切時刻でも既に過ぎている）。
 * 今日の日付は、現在時刻と締切時刻（"HH:mm"）を比較する。
 */
export function isPastDeadline(date: string, deadline: string, now: Date): boolean {
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
 * "YYYY-MM-DD" の曜日を返す。ローカル時刻で構築する。
 *
 * new Date(dateKey) は文字列をUTCとして解釈するため、日本時間での
 * 曜日判定がタイムゾーンによってはずれる。年月日を分解して
 * new Date(year, month, day) で構築することでこれを避ける。
 */
export function weekdayOfDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/**
 * endDate を含む直近 days 日ぶんの日付キーを、古い順に返す。
 *
 * 例: recentDateKeys("2026-08-25", 3) は
 * ["2026-08-23", "2026-08-24", "2026-08-25"]
 */
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

### 新規 `src/db/nonSubmitters.ts`

他のクロスストア集計と同じ「1責務1ファイル」の並びに沿って新規作成する（`cohorts.ts` / `students.ts` / `submissionTypes.ts` / `submissions.ts` はいずれも単一ストア中心だが、これは students・submissionTypes・submissions の3ストアを横断するため独立したファイルにする）。

```ts
export type TodayNonSubmitterGroup = {
  type: SubmissionType;
  /** 対象日の締切を、現在時刻の時点で過ぎているか。 */
  deadlinePassed: boolean;
  /** 出席番号順。 */
  students: Student[];
};

export async function listTodayNonSubmitters(
  cohortId: string,
  date: string,
  now: Date,
): Promise<TodayNonSubmitterGroup[]>
```

処理:
1. `listStudents(cohortId)` から在籍中の生徒を出席番号順に取得
2. `listSubmissionTypes(cohortId)` からアクティブな提出物を取得し、`weekdayOfDateKey(date)` が `weekdays` に含まれるものだけに絞る
3. `listSubmissions(cohortId, date)` で対象日の提出記録を取得
4. 提出物ごとに、記録の無い在籍生徒を抽出
5. 提出物ごとに `isPastDeadline(date, type.deadline, now)` を計算

```ts
export type NonSubmissionCount = {
  student: Student;
  count: number;
};

export async function countRecentNonSubmissions(
  cohortId: string,
  endDate: string,
  now: Date,
  days: number,
): Promise<NonSubmissionCount[]>
```

処理:
1. `recentDateKeys(endDate, days)` で対象日付一覧を作る
2. `listStudents` で在籍中の生徒、`listSubmissionTypes` でアクティブな提出物を取得
3. `by-cohort-date` インデックスを `IDBKeyRange.bound([cohortId, dates[0]], [cohortId, endDate])` で1回のクエリにまとめ、対象期間の提出記録を全部取得する（日付ごとに34回クエリを投げない）
4. 生徒×日付×提出物の組み合わせのうち、「その日が提出日」かつ「**その提出物が作成された日以降**」かつ「締切を過ぎている」かつ「記録が無い」ものをカウント
5. カウント0の生徒は結果から除く。カウント降順、同数なら出席番号昇順

**注意（3で見つけた抜け）:** 提出物には作成日より前の記録は存在しえない。3日前に登録した提出物を「その日が提出日」の条件だけで判定すると、登録前の11日間も全員が未提出としてカウントされてしまう。`toDateKey(new Date(type.createdAt))` より前の日付は、その提出物の集計対象から除く。

呼び出し側（本ステップでは画面）で `days = 14` を渡す。

## 画面

### 新規 `src/screens/Unsubmitted.tsx`

ルート: `/unsubmitted`。既存の `CohortGate` パターンを踏襲する（`Scan.tsx` / `Roster.tsx` と同じ構造: `XxxBody` を `CohortGate` で包む）。

```
┌─────────────────────────┐
│ 8月25日(火)  [名簿へ]     │
├─────────────────────────┤
│ 今日の未提出              │
│                          │
│ 計算ドリル・締切08:15      │
│ 確定                     │
│  [03] [05] [12]          │
│                          │
│ 音読カード・締切08:20      │
│ あと12分                  │
│  [07]                    │
├─────────────────────────┤
│ 直近2週間で未提出が多い生徒  │
│                          │
│ 12番 山田      3回        │
│ 05番 佐藤      2回        │
└─────────────────────────┘
```

- 締切前グループの見出しは藍地に「あとN分」。締切後グループは墨地に「確定」。**朱は使わない**（朱は花丸と完全削除・復元の確認ダイアログのみ、という制約を守る）
- 番号セルはRosterと同じ大きさ（腕を伸ばした距離から読める24pt以上、タップ領域は不要だが視認性は揃える）
- 今日提出日の提出物が無ければ「今日は確認する提出物がありません」
- あるグループの未提出者が0人なら、そのグループごと「◯◯は全員提出しました」の1行に置き換える（空のグリッドを出さない）
- 直近2週間の集計が0件（全員0回）なら「未提出はありません」

### ナビゲーション

`src/screens/Roster.tsx` の下部ナビに新しい行を追加する。既存の2ボタン行（QRを印刷／提出物の設定）の下に、全幅の1ボタンを追加:

```tsx
<Link
  to="/unsubmitted"
  className="border-ai text-ai rounded border-2 px-4 py-3 text-center font-bold"
>
  未提出者・集計を見る
</Link>
```

`src/App.tsx` に `/unsubmitted` ルートを追加する。

## テスト方針

`now` を引数として渡す設計のため、`vi.useFakeTimers` は使わない。テストは実際の現在時刻から相対的にデータを組み立てる（CLAUDE.mdの既存方針）。

例:
- 締切前後の判定: `new Date()` を基準に「1時間後」「1時間前」の `"HH:mm"` を計算してテスト
- 直近2週間の集計: `toDateKey(new Date())` を基準に過去日付を計算してテストデータを作る

## 対象外（YAGNI）

- 声かけ済みチェックなど、DBに新しい状態を書き込む機能は作らない（自動未提出確定は計算のみという方針に反する）
- 過去の任意日を選んで未提出者一覧を見る機能は作らない（このステップでは「今日」固定。集計の2週間分でおおむね事足りる）
- 提出物ごとの日次推移グラフは作らない(生徒ごとの回数のみ)
