# 欠席者枠（未提出者一覧の拡張） 設計書

作成日: 2026-08-27

## 1. 目的

未提出者一覧画面（`src/screens/Unsubmitted.tsx`）で、提出物ごとに生徒を「欠席」としてマークできるようにする。欠席は「未提出」と区別され、直近2週間の未提出集計からも除外される。

## 2. 背景

現在の未提出者一覧は、ステップ4の設計判断により**完全に表示専用**（`docs/superpowers/specs/2026-08-25-non-submitters-design.md`）。「未提出のレコードは作らない」「自動未提出確定は計算のみで、DBに書き込む状態は増やさない」という方針のもと、画面には一切のタップ操作が無い（グリッドのセルは `<li><span>` のみで `onClick` を持たない。これは調査で実コードを確認済み）。

本機能は、この画面に**初めて書き込み操作を持ち込む**。既存方針からの意図的な転換であり、CLAUDE.mdの「対象外（YAGNI）」に明記されていた「DBに新しい状態を書き込む機能は作らない」を、この1点に限って覆す。

## 3. データ層

### 3.1 新しいストアは作らない — `Submission` に `status` を追加

`submissions` ストアの `by-unique`（`[date, studentId, submissionTypeId]`）は、「この組み合わせについてのレコードは高々1つ」を既に保証している。欠席も同じ組み合わせに対する1つの状態として扱えば、この制約をそのまま流用できる。

`src/db/schema.ts`:
```ts
export type Submission = {
  id: string;
  cohortId: string;
  studentId: string;
  submissionTypeId: string;
  date: string;
  submittedAt: number;
  /** 無ければ "submitted" 扱い（既存レコードとの後方互換）。 */
  status?: "submitted" | "absent";
};
```

IndexedDBはレコードごとにフィールドの有無を強制しない。既存レコードに `status` が無くても壊れない。**`DB_VERSION` は上げない。`upgrade()` の変更も無し。** CLAUDE.mdが繰り返し警告するDBマイグレーションのリスク領域を、この機能は踏まない。

検討したが採用しなかった案: `absences` を別ストアとして新設する。DBバージョンを上げる必要があり、`listTodayNonSubmitters` と `countRecentNonSubmissions` と `recordSubmission` の3箇所すべてが2ストア横断になる。`status` フィールド追加に対する利点が無いため不採用。

### 3.2 `recordSubmission` の変更（`src/db/submissions.ts`）

現状（42–91行目）は、`by-unique` に既存レコードがあれば無条件でスキップする（`missing` に入れない）。これを変更し、**`status === "absent"` の既存レコードは上書き対象に含める**。

```ts
const tx = db.transaction("submissions", "readwrite");
const index = tx.store.index("by-unique");

const toWrite: { submissionTypeId: string; existingId: string | undefined }[] = [];
for (const submissionTypeId of input.submissionTypeIds) {
  const existing = await index.get([input.date, input.studentId, submissionTypeId]);
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
```

欠席から提出への上書きは、既存レコードの `id` を再利用した `put()`（同じキーへの上書き）で行う。`RecordResult` の種類は増やさない。欠席だった生徒が実際に提出物を持ってきてScan画面で記録されたときも、既存の `"recorded"`（「提出しました」＋花丸）がそのまま出る。

**書き込み前に全件を検証してから `Promise.all` に渡す**構造を維持する（CLAUDE.mdの「`put()` は失敗すると同期的に例外を投げる」の教訓どおり、配列リテラルの評価順に依存する部分書き込みを避ける）。

### 3.3 新規関数（`src/db/submissions.ts` に追加）

```ts
export type MarkAbsentResult =
  | { kind: "marked" }
  | { kind: "alreadyRecorded" };

export async function markAbsent(input: {
  cohortId: string;
  studentId: string;
  submissionTypeId: string;
  date: string;
}): Promise<MarkAbsentResult> {
  const db = await getDb();
  const tx = db.transaction("submissions", "readwrite");
  const index = tx.store.index("by-unique");

  const existing = await index.get([input.date, input.studentId, input.submissionTypeId]);
  if (existing !== undefined) {
    // 画面側は未提出セルにしか操作を出さないが、念のため防御する。
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

export async function unmarkAbsent(input: {
  studentId: string;
  submissionTypeId: string;
  date: string;
}): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("submissions", "readwrite");
  const index = tx.store.index("by-unique");

  const existing = await index.get([input.date, input.studentId, input.submissionTypeId]);
  // 実提出のレコードを誤って消さないための防御。
  if (existing !== undefined && existing.status === "absent") {
    await tx.store.delete(existing.id);
  }
  await tx.done;
}
```

### 3.4 `listTodayNonSubmitters` の変更（`src/db/nonSubmitters.ts`）

戻り値の `students: Student[]` を、状態つきの配列に変える。

```ts
export type TodayNonSubmitterGroup = {
  type: SubmissionType;
  deadlinePassed: boolean;
  students: { student: Student; status: "unmarked" | "absent" }[];
};
```

処理の変更点: 提出記録の有無だけでなく `status` も見て、`status === "absent"` のレコードがある在籍生徒も対象に含める（除外しない）。出席番号順は維持し、`"unmarked"` と `"absent"` を同じ配列内に混在させる（転出セルがロースター上で番号の並びを保つのと同じ扱い）。

### 3.5 `countRecentNonSubmissions` は変更不要

このロジックは「そのキー（date, studentId, submissionTypeId）の行が存在するか」だけを見て未提出を数えている（`src/db/nonSubmitters.ts` 71–135行目）。欠席も1行作るため、欠席とマークされた日は自動的にカウントから除外される。実装変更は無し。破壊試験を兼ねたテストケースを追加する（欠席レコードがある生徒がカウントに現れないことを確認）。

## 4. 画面（`src/screens/Unsubmitted.tsx`）

### 4.1 セル

現在の `<li><span>{番号}</span></li>`（タップ不可）を、`<li><button onClick={...}>{番号}</button></li>` に変える。`StudentCell.tsx` の命名規約を踏襲: `data-testid="unsubmitted-cell"`、`data-status={status}`（`"unmarked" | "absent"`）、`aria-label` は欠席時に `${番号}番（欠席）` を付ける。

### 4.2 操作

既存の `ConfirmDialog`（`tone="normal"`、藍色）をそのまま再利用する。取り消し可能な軽い操作なので `tone="danger"`（朱）は使わない。フォーカストラップ・Escape閉じ・Tab循環の実装・テストは既存のものを流用でき、新しい仕組みは増やさない。

画面に選択中セルの状態を1つ持つ:
```ts
const [target, setTarget] = useState<{
  studentId: string;
  submissionTypeId: string;
  status: "unmarked" | "absent";
} | null>(null);
```

- `status === "unmarked"` のセルをタップ → `target` をセット → ダイアログ「◯番を欠席にしますか」「欠席にする」/「やめる」→ 確定で `markAbsent`
- `status === "absent"` のセルをタップ → ダイアログ「◯番の欠席を取り消しますか」「取り消す」/「やめる」→ 確定で `unmarkAbsent`
- 確定後、結果の種類に関わらず `todayNonSubmitters.reload()` と `recentCounts.reload()` の両方を呼ぶ（欠席は2週間集計にも影響するため）。`markAbsent` が防御ケース（`alreadyRecorded`）を返した場合も特別なエラー表示は出さず、reloadに任せる — 別タブでの同時操作等により対象の生徒が既にグリッドから消えていれば、再描画で自然に消える
- `onCancel` で `target` を `null` に戻すだけ

### 4.3 見た目

欠席マーク済みのセルは、転出セルと同じ `border-kogan text-kogan hatch border-2 border-dashed` を流用する（`StudentCell.tsx` と同一のクラス組み合わせ）。この画面には転出者が最初から出てこない（`listTodayNonSubmitters` は在籍中の生徒のみを対象にする）ため、視覚的な混同は起きない。5トークン制約の中で新しい視覚パターンを増やさずに済む。

```
┌───────────────────────┐
│ 計算ドリル・締切08:15      │
│ 確定                     │
│  [03] [░5░] [12]         │  ← 05番が欠席（ハッチ柄・破線）
└───────────────────────┘
```

## 5. テスト方針

`docs/superpowers/specs/2026-08-25-non-submitters-design.md` の既存方針を継承する。`vi.useFakeTimers` は使わない。`now` を引数として渡す既存の設計のまま。

破壊試験の対象（CLAUDE.mdの「わざと壊してテストが落ちることを確認する」に沿う）:
- `markAbsent` の防御チェックを外すと、既に提出済みのレコードを欠席で上書きしてしまうケースが通ってしまうことを確認
- `unmarkAbsent` の `status === "absent"` チェックを外すと、実提出のレコードを削除できてしまうことを確認
- `recordSubmission` の上書き条件から `existing.status === "absent"` を外すと、欠席から提出への切り替えができなくなることを確認
- `countRecentNonSubmissions` に欠席レコードがある生徒が含まれないことを確認するテストを追加し、意図的に除外条件を外すと失敗することを確認

## 6. 対象外（YAGNI）

- **その日の全提出物に一括で効く欠席マーク**は作らない。提出物ごとに個別にマークする（ユーザー確認済み）。学校全体の出欠管理を持ち込まない。
- **過去の任意日を選んで欠席をマークする機能**は作らない。未提出者一覧は現状どおり「今日」固定。
- **既に提出済みの生徒を後から欠席に変更する機能**は作らない。未提出（白紙）のセルのみが欠席マークの対象。
- **欠席理由の記録**（体調不良、行事等の分類）は持たない。「欠席」という状態のみ。
