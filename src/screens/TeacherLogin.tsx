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
