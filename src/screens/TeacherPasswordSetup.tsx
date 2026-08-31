import { useState, type FormEvent } from "react";
import { PassphraseNotice } from "../components/PassphraseNotice";
import { ValidationError } from "../db/errors";
import { setTeacherPassword } from "../db/teacherAuth";

/**
 * 初回だけ通る画面。
 *
 * 打ち間違えたまま鍵を掛けると合言葉でしか戻れないため、2回入力させる。
 */
export function TeacherPasswordSetup({
  onDone,
  onExit,
}: {
  onDone: () => void;
  onExit: () => void;
}) {
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
      <button
        type="button"
        onClick={onExit}
        className="text-sumi min-h-11 px-2 font-bold"
      >
        ← こどもがめんへ
      </button>

      <h1 className="font-display text-ai mt-4 text-2xl">
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
