# 日付を選んで提出チェック・採点する

## 解きたいこと

いまスキャン画面（教員・児童）は、画面を開いた時点の日付で固定されている。採点画面は日付を持たず、全期間の未採点をまとめて出している。このため次の2つができない。

1. **翌日提出の宿題を、先に持ってきた子のぶんだけチェックする**
2. **過去の日の提出忘れを、後から受け取って記録する**

どちらも「今日以外の日を対象に提出を記録する」という同じ操作で、今は入口が無い。

## 決めたこと

### 遅れて提出・先に提出

提出日と違う日に受け取った記録を区別する。判定は受け取った日そのもので行い、締切時刻は見ない。朝の会が8:15を数分過ぎても、その日のうちに受け取ったなら通常の提出とする。

- 受け取った日 > 提出日 → **遅れて提出**
- 受け取った日 < 提出日 → **先に提出**（翌日ぶんの先取り。遅刻ではない）
- 同じ → 通常

これは表示だけの概念とする。**未提出者一覧からも「直近の未提出回数」からも、遅れて提出された記録は未提出として数えない。** 出したなら出した、という扱い。

### データ層は変更しない

`submittedAt` の日付と `Submission.date` を比べれば導出できる。`schema.ts`・`DB_VERSION`・`recordSubmission`・`nonSubmitters.ts`・バックアップ形式のいずれも触らない。

検討して捨てた案:

- **`receivedDate` フィールドを足す** — 既存レコードには無いため「無ければ `submittedAt` から導出」という後方互換分岐が結局必要になり、導出のコードを消せない。持ち方が2つに増えるだけ
- **`status: "late"` を足す** — `status` は現在 `"submitted" | "absent"` で、未提出者一覧・採点・集計がこの値で分岐している。値を増やすと `status !== "absent"` のような既存の条件が静かに意味を変える。危険の割に得るものが無い

導出が成り立つ根拠:

- `recordSubmission` は二度目のスキャンで `submittedAt` を上書きしない。期限内に出した記録が後から遅刻に化けない
- 欠席マークを上書きするときは既存idを再利用しつつ `submittedAt` を書き直す。欠席とされた日に後から出したものは、正しく「遅れて提出」になる
- バックアップは `Submission` をまるごと保存しているため、復元しても `submittedAt` は保たれる
- `status` の無い旧レコードにも `submittedAt` はあるので判定できる

弱点は端末の時計に依存すること。ただし `submittedAt` は今もそれに依存しており、新しく持ち込む依存ではない。

## 実装

### 提出のタイミング（`src/lib/date.ts`）

```ts
export type SubmissionTiming = "early" | "onTime" | "late";

/**
 * 提出物の対象日と、実際に受け取った時刻から、提出のタイミングを求める。
 *
 * 受け取った日は submittedAt をローカルで日付に切ったもの。toDateKey を
 * 通すのは、UTC変換で日本時間の朝が前日にずれるのを避けるため。
 * "YYYY-MM-DD" は辞書順の比較が日付の前後と一致する。
 */
export function submissionTiming(
  dateKey: string,
  submittedAt: number,
): SubmissionTiming {
  const received = toDateKey(new Date(submittedAt));
  if (received < dateKey) return "early";
  if (received > dateKey) return "late";
  return "onTime";
}
```

### 日付送りの部品（`src/components/DateStepper.tsx`）

```tsx
DateStepper({
  date: string;
  today: string;
  onChange: (next: string) => void;
  labels: { prev: string; next: string; backToToday: string };
  min?: string;
  max?: string;
})
```

- 前後のボタンと、`date !== today` のときだけ現れる「今日へ」ボタンを出す
- `min` / `max` を超える方向のボタンは出さない（無効化ではなく非表示。押せるのに反応しないボタンは故障に見える）
- **この行に日付そのものは表示しない。** 各画面のヘッダーが既に日付を出しており、両方に出すと同じ文字列を持つ要素が2つになって、テキストで要素を探すクエリが2件にヒットする。`Calendar.tsx` の `formatWeekRangeHeading` が既に避けている落とし穴
- タップ領域は44px四方以上

### 教員のスキャン画面（`src/screens/Scan.tsx`）

- `const [today] = useState(() => new Date())` を、動かせる日付の状態に変える
- ヘッダーの下に `DateStepper` を置く。範囲は無制限
- **今日以外を見ている間はヘッダーを藍で反転する**（`bg-ai` + `text-gayoshi`）。朝の会での誤タップは「静かに違う日へ記録が入る」形で失敗するため、見た目で気づける必要がある。朱は使わない（花丸と取り消せない操作の確認だけに残す）
- 日付を動かしたら、選択中の提出物（`selectedIds`）と直前の結果（`result`）を捨てる。持ち越すと、その日に提出日が来ていない項目が選択されたまま記録される。`useEffect` での同期は置かず、日付送りのハンドラ内で明示的に捨てる
- 空表示の文言を「今日が提出日の宿題はありません」→「この日が提出日の宿題はありません」に変える
- `ScanResult` に、今日以外へ記録したときだけ対象日を添える（例:「8月31日(日)分 / 12番 / 提出しました」）。記録先が黙って決まらないようにする

### 児童のスキャン画面（`src/screens/KidsScan.tsx`）

同じ日付送りを、**今日より前へは戻れない形**で入れる。

- 範囲は今日から翌日までの1日だけ（`min` = 今日、`max` = 翌日）
- 今日にいるときは戻るボタンを出さない。翌日にいるときだけ「← きょうにもどる」が出る
- 子どもが自分で過去の日を提出済みにできてはいけない。過去分の補正は教員の画面だけに残す
- 今日以外のときはヘッダーを反転。教員画面と同じ合図
- 文言はひらがな。「きょうは だすものが ありません」は翌日を見ているときに嘘になるため、日付に応じて出し分ける
- 日付を動かしたら `selectedIds` と `result` を捨てる（教員画面と同じ理由）

この画面が番号パッドも進捗も初期選択も持たないのは「子供が触る」ことから来ている（`KidsScan.tsx` の冒頭コメント）。日付送りも同じ原則で、前方向にだけ開く。

### 採点画面（`src/screens/Grading.tsx`, `src/db/grading.ts`）

```ts
export async function listGradingItems(
  cohortId: string,
  receivedDate: string,
): Promise<{
  ungraded: GradingItem[];           // 受け取った日で絞る
  resubmitPending: GradingItem[];    // 絞らない。全期間のまま
  otherDaysUngradedCount: number;    // ほかの日に残っている未採点の数
  oldestUngradedDate: string | null; // その一番古い受け取り日
}>
```

- 既定は今日。日付送りは教員スキャン画面と同じ形（範囲は無制限）
- スキャン画面と違い、この画面の見出しは日付ではなく「採点」。`DateStepper` は日付を出さないので、見出しの下に対象日を1行で添える（画面内で日付が現れるのは1箇所だけにする）
- **絞るのは受け取った日で、提出日ではない。** 採点は「今日手元にあるドリルを見る」作業なので、8/31提出のものを9/3に受け取ったなら9/3の欄に出す。提出日で絞ると、現物が手元にあるのに古い日を探しに行かないと見つからない
- **再提出待ちは絞らない。** 日をまたいで追いかけるものなので、絞ると見失う
- 「今日が既定」だと前の日の採点し忘れが自分からは見えなくなる。未採点の見出しの下に `ほかの日に未採点 12件 → 一番古い日へ` を出し、押すとその日へ飛ぶ。全項目を既にメモリに読んでいるので数えるコストは無い
- 行の表示は今のまま提出日を出し、`late` / `early` のときだけ「遅れて提出」「先に提出」を添える
- 並び順（提出物の表示順 → 提出日 → 出席番号）と `type.id` をキーにした Map グルーピングはそのまま。日付指定の提出物は `order` が常に0なので、配列の隣接でグルーピングしてはいけない
- **採点画面のヘッダーは反転させない。** 反転はスキャン画面で「記録が黙って違う日に入る」のを防ぐための合図であり、採点はどの書き込みも日付が書かれた行のボタンを押す操作なので、その危険がない。合図をどこにでも付けると合図でなくなる

### 変更しないもの

- `src/db/schema.ts`、`DB_VERSION`（3のまま）、移行処理
- `src/db/submissions.ts`（`recordSubmission` / `markAbsent` / `unmarkAbsent`）
- `src/db/nonSubmitters.ts`、未提出者一覧、直近の未提出回数
- `src/backup/`（形式・バージョンとも）
- カレンダー画面、提出物の設定画面

## テスト

- `src/lib/date.test.ts` — `submissionTiming` の3方向。日付は実際の今日からの相対で組み立て、`vi.useFakeTimers` は使わない（fake-indexeddb のスケジューリングが止まり、`Date.now()` の凍結で `waitFor` が経過時間を測れなくなる）
- `src/db/grading.test.ts` — 受け取った日での絞り込み、再提出待ちが絞られないこと、`otherDaysUngradedCount` と `oldestUngradedDate`
- `src/screens/Scan.test.tsx` — 日付を送ると別の日に記録が入る／選択と結果が捨てられる／ヘッダーが反転する／今日へ戻る
- `src/screens/KidsScan.test.tsx` — 翌日へ行ける、今日より前へは行けない、翌々日へも行けない
- `src/screens/Grading.test.tsx` — 既定が今日、送ると絞られる、再提出待ちは絞られない、ほかの日の件数から一番古い日へ飛べる
- `src/components/DateStepper.test.tsx` — 範囲の端でボタンが出ない、今日にいるとき「今日へ」が出ない

既存要素の属性や中身を見るときは `waitFor` で囲む。`findBy*` が待つのは要素の出現であって中身の更新ではない。再描画で要素が差し替わるため、掴んだDOM参照を使い回さず毎回引き直す。

各タスクで「わざと壊してテストが落ちること」を確認する。

**壊れる既存テスト**: `listGradingItems` と `useGradingItems` の引数が増えるため、`src/db/grading.test.ts` と `src/screens/Grading.test.tsx` の呼び出しを直す。データ層とDBは無変更なので移行テストには影響しない。

## 実装後の機械的な検査

- 朱（`shu`）の使用箇所が、花丸と `ConfirmDialog` の `tone="danger"` だけであること
- Tailwind素のカラー（`text-white` 等）が入っていないこと
- `any` が無いこと
- 新しいボタンのタップ領域が44px四方以上であること
- 375px幅で崩れないこと、`prefers-reduced-motion` を尊重すること
