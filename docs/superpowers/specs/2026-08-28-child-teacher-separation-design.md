# 児童用ページと教員用ページの分離 設計書

作成日: 2026-08-28

## 1. 目的

子供たち自身が宿題の提出をスキャンできるようにする。アプリを児童用ページと教員用ページに分け、教員用ページはパスワードの入力を求める。

## 2. 背景と運用の前提

これまでこのアプリは、**先生が一人で操作する**ことを前提にしてきた。8:15の締切前、タブレットを片手に持ち、もう片方でドリルを受け取りながらスキャンする。CLAUDE.mdに書かれた設計判断の多くが、この前提から出ている。

本機能は操作する人を変える。**教室に置いた1台のタブレットに、子供が自分で近づいてQRカードをかざす。** 先生は準備の時間に同じ端末でパスワードを入力し、教員用ページに入る。

端末は共有の1台であり、データは従来どおり端末内のIndexedDBに閉じる。生徒ごとに端末を配る構成は取らない（データが端末ごとに分かれてしまい、既存の設計前提と衝突する）。

### 2.1 この鍵が守るもの、守らないもの

**守るもの:** 小学生が興味本位で名簿や集計を開くこと。誰かの提出状況を勝手に書き換えること。

**守らないもの:** 本気の攻撃者。IndexedDBはDevToolsから読め、`teacherAuth` レコードを消せば認証は「未設定」状態に戻り迂回できる。これは端末内で完結するオフラインアプリの構造上避けられない。

したがって目標は「平文のパスワードをどこにも残さない」「UIからは正しいパスワードなしに教員画面へ到達できない」の2点に限る。それ以上の強度を目指した仕組み（暗号化されたDB、端末ロックとの連携）は入れない。

## 3. 画面構成

### 3.1 ルーティング（`src/App.tsx`）

```
/            児童画面（新規 KidsScan）      ガードなし
/setup       初期設定                       ガードなし
/scan        教員用スキャン                 ┐
/roster      名簿                           │
/roster/new, /roster/:id/edit               │
/print       QRカード印刷                   ├ TeacherGate
/submissions 提出物マスタ（new, edit 含む）  │
/unsubmitted 未提出者一覧                   │
/calendar    カレンダー                     │
/settings    設定・バックアップ             ┘
*            → /
```

`/setup` をガードの外に置く理由は、クラスもパスワードもまだ存在しない状態で開く画面だから。クラスが無ければ `CohortGate` が既に `/setup` へ飛ばしている（この挙動は変えない）。

**`/setup` がガードの外にあっても、既存データを壊す穴にはならない。** 既存の `SetupGate` は、cohortが既に存在するなら `/setup` を開かせず `/roster` へ送る（`createCohort` が既存cohortを無効化するため、再度開くと名簿が全員消えるという理由で入っている既存のガード）。子供が `/setup` を開いても `/roster` へ送られ、そこで `TeacherGate` がパスワードを求める。

この安全性は `SetupGate` の既存リダイレクトに依存している。`SetupGate` を外したり、cohortがある場合の遷移先を変えたりすると、ここが穴になる。

包み方はレイアウトルートを使い、教員ルートごとに `<TeacherGate>` を書き並べない。

```tsx
<Route element={<TeacherGate><Outlet /></TeacherGate>}>
  <Route path="/scan" element={<Scan />} />
  <Route path="/roster" element={<Roster />} />
  {/* 以下、教員ルートすべて */}
</Route>
```

`TeacherGate` は `children` を受け取る形にする（`Outlet` を内部で直接呼ばない）。ルーターを組まなくても単体でテストできるようにするため。

`*` の行き先を `/scan` から `/` に変える。**URLを覚えていない人が開いたときに着くのは児童画面である**、という既定を作る。

### 3.2 認証状態の置き場所

```tsx
<BrowserRouter>
  <TeacherAuthProvider>
    <AppRoutes />
    <UpdateBanner />
  </TeacherAuthProvider>
</BrowserRouter>
```

`TeacherAuthProvider` を `AppRoutes` の外に置く。ルート間を移動しても Provider はアンマウントされないため、先生が名簿→集計→設定と渡り歩く間、パスワードを再入力させられない。

```ts
type TeacherAuthValue = {
  authenticated: boolean;
  signIn: () => void;
  signOut: () => void;
};
```

**状態はメモリのみに持つ。** `sessionStorage` も `localStorage` も使わない。「リロードとアプリの再起動で解除される」という要件が、**何も書かないこと**によって満たされる。保存する仕組みを足せば、解除する仕組みも足さねばならない。

パスワードの検証そのものは `TeacherGate` が db 層を呼んで行い、成功したときに `signIn()` を呼ぶ。Provider は検証を知らない。

**Context を export する。** テストが認証済み状態を作るためで、これが唯一の注入口になる。

```tsx
export const TeacherAuthContext = createContext<TeacherAuthValue | null>(null);
```

`TeacherAuthProvider` に `initialAuthenticated` のような prop は**持たせない**。本番のコンポーネントに認証を素通りさせる引数を作ると、いつか本番の呼び出し側で渡される。テストは Provider を使わず Context に直接値を与える。

`TeacherGate` は Context が `null`（Provider の外）なら例外を投げる — `useActiveCohort` と同じ形にする。フェイルクローズであり、Provider を付け忘れたルートが認証なしで通ってしまう事故を防ぐ。

### 3.3 教員画面から児童画面へ戻る

`AppHeader`（教員画面が共通で使うヘッダ）に「児童画面に戻る」を追加する。押すと `signOut()` して `/` へ `navigate` する。

無操作での自動解除は入れない。先生が戻し忘れる危険は残るが、タイマーは「設定を書いている途中で締め出される」という別の不便を生む。まず明示的なボタンで運用し、実機での確認を経てから必要性を判断する。

## 4. データ層

### 4.1 保存する形（`settings` ストア）

既存の `settings` ストアに1レコードを足す。**`DB_VERSION` は上げない。`upgrade()` も変更しない。** ストアの構成は変わらないため、CLAUDE.mdが警告するマイグレーションのリスク領域を踏まない。

```ts
// src/db/teacherAuth.ts
const TEACHER_AUTH_KEY = "teacherAuth";

type TeacherAuth = {
  /** PBKDF2 の salt（Base64） */
  salt: string;
  /** 導出鍵（Base64） */
  hash: string;
  /** 反復回数。将来上げられるようレコードに持たせる */
  iterations: number;
  /** 合言葉。パスワードとは別の salt を使う */
  recoverySalt: string;
  recoveryHash: string;
};
```

既存の `getSetting` / `setSetting` は boolean 専用なので使わない。`getDefaultDeadline` / `setDefaultDeadline` と同じく、この用途専用の関数を `src/db/teacherAuth.ts` に置く。

読み出したレコードは形を検証してから使う。壊れていた（あるいは手で消された）場合は「未設定」として扱う — 開けなくなるより、設定し直せるほうがよい。

### 4.2 ハッシュ化

```ts
const ITERATIONS = 100_000;

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
    256,
  );
  return toBase64(new Uint8Array(bits));
}
```

PBKDF2-SHA256 を Web Crypto で使う。外部ライブラリを足さない（ネットワークアクセス禁止の制約に加え、暗号ライブラリを増やす理由がない）。jsdom のテスト環境で動くことは確認済み。

比較は単純な文字列比較にする。定数時間比較は入れない — 攻撃者がDevToolsでハッシュそのものを読める環境で、タイミング差を測る意味がない。

`salt` は `crypto.getRandomValues(new Uint8Array(16))`。Base64 化は `btoa(String.fromCharCode(...bytes))`（16〜32バイトなのでスプレッドで問題ない）。

### 4.3 公開する関数

```ts
export async function isTeacherPasswordSet(): Promise<boolean>;
/** 設定して合言葉を返す。返した合言葉は保存されない（ハッシュのみ保存） */
export async function setTeacherPassword(password: string): Promise<string>;
export async function verifyTeacherPassword(password: string): Promise<boolean>;
/** 合言葉が合えば新しいパスワードを設定し、新しい合言葉を返す */
export async function resetTeacherPassword(
  phrase: string,
  nextPassword: string,
): Promise<string>;
```

パスワードは4文字以上。それ未満は `ValidationError`（既存の `src/db/errors.ts`）で「パスワードは4文字以上にしてください」。

再設定のときは合言葉も作り直す。古い合言葉を紙で持ったままにしない。

### 4.4 合言葉（`src/lib/passphrase.ts`）

ひらがなの単語64語をハードコードした配列から、`crypto.getRandomValues` で4語を選び、ハイフンで繋ぐ。

```
みかん-そら-ひかり-なつ
```

紙に控えて引き出しに入れる前提なので、読み書きしやすさを優先する。単語は小学生でも読める2〜4文字のひらがなで、音が紛れにくいものを選ぶ（「し」と「ち」だけが違う語を同時に入れない等）。**64語の具体的な中身は実装時に確定する。** 語数（64）と選定基準はここで決めた通りとし、テストは語数と重複の無さを検証する（個々の語を固定するテストは書かない — 語を入れ替えるたびに壊れるため）。

強度は 64⁴ ≒ 1,677万通り（約2²⁴）。暗号鍵としては弱いが、この合言葉が守るのは「子供が偶然当てないこと」であり、試行はUIから1回ずつ、各試行がPBKDF2の10万回反復で律速される。目的に対して十分と判断する。

照合の前に正規化する: 前後の空白、全角空白、ハイフンを除去して比較する。紙から書き写すとき、ハイフンを省いたり空白で区切ったりするのは自然な揺れであり、それで弾かない。

## 5. TeacherGate の3状態

```
crypto.subtle が無い → 「httpsで開いてください」（後述）
パスワード未設定     → 設定画面（TeacherPasswordSetup）
設定済み・未認証     → 入力画面（TeacherLogin）
認証済み             → children
```

読み込み中は既存の `FullScreenMessage` で「読み込んでいます」。DB読み出しに失敗したときも同様に既存のエラー表示に載せる。

`/teacher` のような専用ルートは作らない。先生が `/roster` を開けば、その場所で必要な画面が出て、通れば `/roster` がそのまま描画される。認証のためだけにURLを行き来させない。

### 5.1 初回に通る道

新品の端末では、既存のコードと組み合わせて次の順に進む。新しい導線を足す必要はない。

1. `/` を開く → `CohortGate` がcohort無しを検出 → `/setup` へ
2. クラスを作る → 既存の `Setup` が `/roster` へ `navigate`（`src/screens/Setup.tsx:32,53`）
3. `/roster` は `TeacherGate` の内側 → パスワード未設定 → 設定画面

**クラスを作った直後にパスワードを決める流れになる。**

ただしこの間、パスワードは未設定であり、**誰でも設定画面にたどり着ける。** 先生が設定を終える前に子供が端末を触れば、子供がパスワードを握れてしまう。これを仕組みで塞ぐことはしない（未設定状態で設定画面を守る鍵は存在しない）。運用で担保する項目として `docs/手元での確認手順.md` に「初期設定を終えるまで端末を子供に渡さない」を書く。

### 5.2 TeacherPasswordSetup

初回だけ通る画面。パスワードを2回入力させる（打ち間違いのまま鍵を掛けると、合言葉でしか戻れない）。設定に成功したら**合言葉を大きく表示し、控えたことを確認するチェックを経てから先へ進める。** この画面を閉じると合言葉は二度と表示できない（ハッシュしか保存していない）ため、その旨を画面に書く。

### 5.3 TeacherLogin

パスワード入力（`type="password"`）と、「パスワードを忘れたとき」から開く合言葉での再設定。

誤入力の回数によるロックアウトは入れない。PBKDF2の反復が総当たりを遅くしており、鍵を掛けた先生自身が締め出される害のほうが大きい。

## 6. 児童画面（`src/screens/KidsScan.tsx`）

既存の `SubmissionToggleBar`、`Hanamaru`、`CameraView`、`useQrCamera` を再利用する。教員用スキャン画面（`src/screens/Scan.tsx`）は残す — カードを忘れた子や欠席者を先生が代わりに記録する手段が要るため。

教員用との違いは次の5点。

**1. 提出物の初期選択は空。** 教員用は「今日が提出日のもの全部」を初期選択にしている（先生が毎朝選び直す手間を省くため）。児童用でこれをやると、何も考えずにカードをかざした子が、出していない宿題まで提出済みになる。子供が自分で選んでからかざす。

選択が空の間は「だしたものをえらんでね」と表示し、QRを読んでも記録しない（既存の `handleScan` が `selected.length === 0` で早期returnする挙動と同じ）。

**2. スキャン成功後に選択をリセットする。** 前の子の選択が次の子に引き継がれる事故を防ぐ。1人ごとに選び直す。

**3. 次の子が提出物を選び始めたら、前の子の結果を消す。** `onToggle` で `result` を `null` にする。花丸と番号が出たまま次の子が操作を始めると、誰の結果か分からなくなる。

**4. 番号パッドを出さない。** 他人の番号を押せてしまう。カメラが使えない場合は「せんせいをよんでください」と表示する（教員用スキャン画面には番号パッドが残っているので、先生が代わりに記録できる）。

**5. 進捗表示を出さない。** 教員用の下部にある「漢字ドリル 12人」はクラス全体の状況であり、教員の情報。児童画面では `useSubmissions` を呼ばない。

教員ページへの入口として、ヘッダの隅に控えめな「せんせい」ボタンを置く（`/roster` へのリンク、タップ領域は44px四方を確保）。目立たせないが、先生が探せる位置に常設する。

文言はひらがなを多くする。花丸は既存の `Hanamaru` をそのまま使う（朱の使用は花丸に限る、という制約に沿う）。

### 6.1 何も出せない状態の文言

教員用スキャン画面は、提出物が未登録なら「まず提出物を登録してください」と `/submissions` へのリンクを出す。児童画面では**子供に打つ手が無い**ので、設定画面へは誘導せず、先生を呼ぶよう促す。

| 状態 | 児童画面の表示 |
|---|---|
| 提出物が1つも登録されていない | きょうは だすものが ありません |
| 今日が提出日の宿題が無い | きょうは だすものが ありません |
| カメラが使えない・許可されていない | せんせいを よんでください |
| 提出物を選んでいない | だしたものを えらんでね |

`FullScreenMessage` を児童画面のエラー表示に使うときは `showBackLink={false}` を渡す。既定の戻り先は `/roster`（教員ルート）であり、子供には開けないリンクを出しても意味がない。

## 7. エラー処理

**`crypto.subtle` が使えない場合。** セキュアコンテキスト（HTTPSまたはlocalhost）でなければ `crypto.subtle` は存在しない。この状態ではパスワードの検証ができない。

`TeacherGate` の先頭で `typeof crypto?.subtle === "undefined"` を判定し、`FullScreenMessage` で次を出す:

> この画面を開くには https で接続してください。いまの接続ではパスワードを確認できません。

児童画面のカメラも同じ制約で動かないため、条件は一致している（`getUserMedia` はセキュアコンテキスト限定でポリフィルが存在しない、という既存の設計判断と同じ理由）。黙って壊れるのではなく、何が起きたかと次にどうするかを出す。

その他のエラー文言（謝罪表現を使わない）:

- パスワードが違う → 「パスワードが違います」
- 2回の入力が一致しない → 「同じパスワードをもう一度入力してください」
- 4文字未満 → 「パスワードは4文字以上にしてください」
- 合言葉が違う → 「合言葉が違います。控えた紙のとおりに入力してください」
- 保存に失敗 → 「設定を保存できませんでした。もう一度お試しください」

## 8. テスト

### 8.1 データ層

- 設定したパスワードで `verifyTeacherPassword` が通り、違うパスワードで通らない
- 保存されたレコードに平文が含まれない
- salt が呼び出しごとに異なる（同じパスワードでも hash が変わる）
- 4文字未満で `ValidationError`
- 合言葉で再設定でき、**古いパスワードでは通らなくなる**
- 合言葉の正規化（ハイフンなし・空白区切り・前後の空白）が通る
- 壊れた `teacherAuth` レコードがあるとき「未設定」として扱う

### 8.2 TeacherGate

- 未設定のとき設定画面が出る
- 設定済み・未認証のとき入力画面が出て、children が描画されない
- 正しいパスワードを入れると children が描画される
- Provider を作り直すと（リロード相当）再び入力を求められる
- **「児童画面に戻る」を押した後、教員ルートへ戻ると再び入力を求められる。** 認証状態がメモリのみなので、ブラウザの戻るボタンで `/roster` に戻っても `TeacherGate` が守る。この経路は塞ぎ忘れやすいので明示的に検証する
- `crypto.subtle` が無いとき https の案内が出る

### 8.3 児童画面

- 提出物が初期状態で1つも選ばれていない
- 選択が空のままQRを読んでも記録されない
- スキャン成功後に選択が空へ戻る
- 提出物を選び直すと前の結果が消える
- 名簿へのリンク、番号パッド、進捗表示が存在しない

### 8.4 進め方

CLAUDE.mdの方針に従い、**各タスクで「わざと壊してテストが落ちること」を確認する。** 特に 8.2 の「children が描画されない」と 8.3 の「記録されない」は、素通りしても通ってしまう形のテストになりやすい。ガードを外した状態でテストが赤くなることを目で見る。

非同期の判定は既知の落とし穴（`findBy*` は中身の更新を待たない、既存要素の属性は `waitFor` で囲む、DOM参照を使い回さない、`clear()`+`type()` を避けて `fireEvent.change` を使う）に沿って書く。PBKDF2の10万回反復は1回あたり数十〜数百msかかるため、テストのタイムアウトに注意する。

`vi.useFakeTimers` は使わない（fake-indexeddb が壊れる、`waitFor` が経過時間を測れなくなる）。

## 9. 対象外（YAGNI）

- 無操作での自動解除（タイマー）
- 誤入力回数によるロックアウト
- 生徒ごとの端末・アカウント
- 児童画面から自分の提出履歴を見る機能
- パスワードの変更画面（合言葉での再設定で兼ねる）
- 教員の権限分け（担任と副担任など）

## 10. 影響を受ける既存ファイル

| ファイル | 変更 |
|---|---|
| `src/App.tsx` | ルート構成、`TeacherAuthProvider`、`*` の行き先 |
| `src/components/AppHeader.tsx` | 「児童画面に戻る」を追加 |
| `src/db/settings.ts` | 変更なし（`teacherAuth.ts` を別に作る） |
| `src/db/schema.ts` | 変更なし（`DB_VERSION` を上げない） |
| `src/screens/Scan.tsx` | 変更なし（教員用として残す） |
| `docs/手元での確認手順.md` | 人の目でしか確かめられない項目を追記（下記） |

`docs/手元での確認手順.md` に足す項目:

- 初期設定（クラス作成とパスワード設定）を終えるまで端末を子供に渡さない
- 合言葉を紙に控えて保管する。控えないまま設定画面を閉じると二度と表示できない
- 児童画面の「せんせい」ボタンを子供が押しても、名簿が見えずパスワードを求められる
- 教員画面から児童画面に戻った後、ブラウザの戻るボタンで名簿に戻れない
- 児童が実際にQRカードをかざす高さ・距離でカメラが読み取れる（教室に据え置いた場合の画角。先生が手に持つ場合と条件が変わる）

新規ファイル: `src/db/teacherAuth.ts`、`src/lib/passphrase.ts`、`src/components/TeacherAuthProvider.tsx`、`src/components/TeacherGate.tsx`、`src/screens/TeacherPasswordSetup.tsx`、`src/screens/TeacherLogin.tsx`、`src/screens/KidsScan.tsx`

### 10.1 既存テストへの影響

**12個の既存テストファイルが赤くなる。** これらは `<MemoryRouter><AppRoutes /></MemoryRouter>` の形で教員ルートを直接開いており、`TeacherGate` が入るとパスワード画面に阻まれる。

対象: `Print` `Calendar` `Roster` `Settings` `Scan` `StudentEdit` `StudentNew` `SubmissionList` `SubmissionNew` `SubmissionEdit` `Unsubmitted` `Home`（`Setup` と `SetupGuard` は `/setup` を開くので影響を受けない。`SettingsSaveFailure` と `SettingsRestoreFailure` は画面コンポーネントを直接レンダーするので影響を受けない）

`src/test/router.tsx` に認証済みでレンダーするヘルパーを置き、対象ファイルの `render` をそれに差し替える。**ガードの追加とテストの移行は同じタスクで行う** — 分けると赤いままコミットすることになる。

`Home.test.tsx` は意味そのものが変わる。現在は「`/` を開くとスキャン画面が出る」を検証しているが、`/` は児童画面になる。「`/` は児童画面」「知らないパスは `/` へ送る」の2つに書き直す。
