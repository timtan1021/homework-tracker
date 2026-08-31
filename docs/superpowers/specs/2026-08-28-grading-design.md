# 採点（合格・再提出） 設計書

作成日: 2026-08-28

## 1. 目的

現在「提出済み」は花丸が付くだけで、中身の出来は記録されない。この設計は、提出済みの記録を先生が後からまとめて見て「合格」か「再提出」かを仕分けられる、新しい採点画面を追加する。

## 2. 背景・前提（すでに合意済みの決定）

- 「提出済み」の中をさらに合格／再提出の2種類に分ける（提出そのものの判定とは別の軸）
- 採点はスキャンと同時ではなく、**後からまとめて別の専用画面で**行う
- 対象は**すべての提出物に一律**（提出物ごとの設定は持たない）
- 採点画面は**未採点のものを日付を問わず全部**が対象（今日だけに絞らない）
- 「再提出」と付いた記録は**未提出者一覧・直近2週間の集計には出さない**（提出済みの一種として扱う。既存の「statusが`absent`でなければ提出済み」という判定にそのまま乗るため、この2つの画面のコード変更は不要）
- 採点結果は**後から変更できる**（合格⇄再提出、再提出→未採点に戻す）
- 採点画面への導線は**名簿画面の下部ナビに新しい行を追加**
- 「再提出待ち」の一覧は**採点画面の中にセクションとして表示**する（`Unsubmitted.tsx` は変更しない）

## 3. データ層

### 3.1 新しいストアは作らない — `Submission` に `grade` を追加するだけ

既存の `status?: "submitted" | "absent"` とは独立した、任意フィールド `grade?: "passed" | "resubmit"` を追加する。欠席機能・日付指定機能と同じ「フィールド追加のみ」パターンで、**DB_VERSIONは上げない**。

```ts
export type Submission = {
  id: string;
  cohortId: string;
  studentId: string;
  submissionTypeId: string;
  date: string;
  submittedAt: number;
  status?: "submitted" | "absent";
  /** 採点結果。未定義なら未採点。欠席の記録には付けない。 */
  grade?: "passed" | "resubmit";
};
```

`status` と `grade` を分けた理由: 「欠席かどうか」と「中身の出来」は別の軸であり、1つのフィールドに `"submitted" | "absent" | "passed" | "resubmit"` を詰めると「passedなのに実は欠席」のような矛盾した組み合わせを型で防げなくなる。独立フィールドなら「`status`が`absent`でなければ`grade`を持ちうる」という素直な関係になる。

### 3.2 日付を問わず全件取得する — 新しいインデックスは作らない

`submissions` ストアには `by-cohort-date`（複合）と `by-unique` しか無く、「cohortだけで全期間」を引く単独インデックスが無い。ここで新しいインデックスを追加するとDBマイグレーションが必要になる。代わりに、既存の `by-cohort-date` を**日付の範囲を全開にした`IDBKeyRange`**で使う。

```ts
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
```

`""` は `"YYYY-MM-DD"` 形式のどんな日付よりも辞書順で小さく、`"\uffff"` はどんな日付よりも大きいため、この範囲は「そのcohortの全期間」と一致する。`countRecentNonSubmissions`（`nonSubmitters.ts`）が同じ複合インデックスに範囲指定でアクセスする既存の手法をそのまま延長している。

### 3.3 新規 `src/db/grading.ts`

```ts
import { getDb } from "./schema";
import type { Student, Submission, SubmissionType } from "./schema";
import { listStudents } from "./students";
import { listSubmissionTypes } from "./submissionTypes";

export type GradingItem = {
  submission: Submission;
  student: Student;
  type: SubmissionType;
};

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
 */
export async function listGradingItems(cohortId: string): Promise<{
  ungraded: GradingItem[];
  resubmitPending: GradingItem[];
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

  return {
    ungraded: items.filter((item) => item.submission.grade === undefined),
    resubmitPending: items.filter(
      (item) => item.submission.grade === "resubmit",
    ),
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

`listGradingItems` が学生・提出物の一覧を1回だけ取得して両方のリストを組み立てるのは、`未採点`と`再提出待ち`を別々のフックにすると同じ横断クエリを2回走らせることになるため。1つの関数・1つのフックにまとめる。

## 4. 画面

### 4.1 新規 `src/screens/Grading.tsx`、ルート `/grading`

既存の `CohortGate` パターンを踏襲する（`Unsubmitted.tsx` と同じ構造。`TeacherGate` はルート側で既に掛かっているので、この画面自身では意識しない）。

```
┌─────────────────────────┐
│ [名簿へ]                  │
├─────────────────────────┤
│ 未採点                    │
│                           │
│ 計算ドリル                 │
│  8/24(月) 5番 山田  [合格][再提出] │
│  8/25(火) 12番 佐藤 [合格][再提出] │
│                           │
│ 日記                      │
│  8/24(月) 3番 鈴木  [合格][再提出] │
├─────────────────────────┤
│ 再提出待ち                 │
│                           │
│ 計算ドリル                 │
│  8/23(日) 7番 田中  [合格][未採点に戻す] │
└─────────────────────────┘
```

- `useGradingItems(cohort.id)` で `{ ungraded, resubmitPending }` を取得。提出物名でグループ化して表示（`item.type.id` でグルーピング、`type.order` 順は `listGradingItems` が既に保証している）
- 各行: `{formatDateHeading(dateFromKey(item.submission.date))} {item.student.attendanceNumber}番{item.student.name}` ＋ ボタン2つ
- **未採点セクション**のボタン: 「合格」（`bg-ai text-gayoshi`、塗りつぶし＝主要な操作）／「再提出」（`border-ai text-ai border-2`、輪郭＝もう一方の操作）。既存の名簿ナビの「塗りつぶし＝主、輪郭＝副」という配色文法をそのまま流用する
- **再提出待ちセクション**のボタン: 「合格」（同上）／「未採点に戻す」（`text-ai underline`、既存の「やめる」「閉じる」系の軽い取り消しボタンと同じ見た目）
- タップすると即座に反映し、その行はセクションから消える（未採点→合格/再提出でセクションを移る、再提出待ち→未採点に戻すで未採点セクションに戻る）。**確認ダイアログは無し**（可逆的で低リスクな操作のため。合格・完全削除のような後戻りできない操作にだけ`ConfirmDialog`の`tone="danger"`を使うという既存方針を守る）
- どちらのセクションも空なら「未採点の提出物はありません」「再提出待ちの生徒はいません」のような案内を出す（空のグリッドを見せない、という既存の方針を踏襲）

### 4.2 書き込み失敗時のフィードバック（設計時点で組み込む）

過去2回の機能追加で、書き込み失敗を無言で握りつぶしてレビューの指摘を受けた経緯がある。今回は最初から組み込む。

```tsx
const [error, setError] = useState<string | null>(null);

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
```

エラーは画面上部に `<p role="alert" className="text-sm font-bold">{error}</p>`（`Unsubmitted.tsx` と同じ表示パターン）。

### 4.3 名簿画面からの導線

`src/screens/Roster.tsx` の下部ナビ、`/calendar` の直後に同じ見た目の行を追加する:
```tsx
<Link
  to="/grading"
  className="border-ai text-ai rounded border-2 px-4 py-3 text-center font-bold"
>
  採点する
</Link>
```

### 4.4 ルート追加

`src/App.tsx` の `TeacherGate` 配下（`/calendar` の直後）に `<Route path="/grading" element={<Grading />} />` を追加する。`import { Grading } from "./screens/Grading";` はアルファベット順で `Calendar` の直後に挿入する。

## 5. 未提出者一覧・集計への影響（無い、という確認）

`listTodayNonSubmitters` と `countRecentNonSubmissions`（`src/db/nonSubmitters.ts`）は、提出記録があり `status` が `"absent"` でなければ「提出済み」として未提出者一覧から除外する、という判定を既に持っている。`grade`フィールドの有無やその値を見ていないため、**この2つの関数もUnsubmitted.tsxもコード変更は不要**。「再提出」と付けても記録自体は消えないので、この既存ロジックにそのまま乗って未提出者一覧には出ない。

## 6. テスト方針

`docs/superpowers/specs/2026-08-27-absence-marking-design.md`・`2026-08-27-date-submissions-design.md` と同じ既存方針を継承する。`vi.useFakeTimers` は使わない。`src/test/router.tsx` の `renderAsTeacher` を使い、教員サインインの手順を省略する。

破壊試験の対象:
- `listGradableSubmissions` の `status !== "absent"` フィルタを外すと、欠席の記録が採点対象に混ざることを確認
- `listGradingItems` の転出フィルタ（`student.status === "active"`）を外すと、転出した生徒の記録が採点画面に出てしまうことを確認
- `clearGrade` を外す（何もしない実装に変える）と、「未採点に戻す」を押しても再提出待ちセクションから消えないだけで実際には未採点セクションに戻らないことを確認

## 7. 対象外（YAGNI）

- **提出物ごとの採点対象・対象外の設定**は作らない。すべての提出物に一律
- **合格済み一覧の表示**は作らない。合格にした記録は採点画面のどちらのセクションにも出なくなる（再提出待ちセクションで一度「合格」にした場合のみ、その場でセクションから消える形で確認できる）
- **採点コメント・点数などの自由記述**は持たない。合格／再提出の2値のみ
- **スキャンと同時の採点**は作らない（合意済み。後から別画面でまとめて行う）
- **未提出者一覧・集計画面への「再提出待ち」表示の統合**は作らない（採点画面内で完結する）
