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
