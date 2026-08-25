import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { createCohort } from "../db/cohorts";
import { currentSchoolYear } from "../lib/schoolYear";
import { parseBackup, restoreBackup } from "../backup/import";
import { InvalidBackupError } from "../backup/types";

export function Setup() {
  const navigate = useNavigate();
  const [year, setYear] = useState(currentSchoolYear());
  const [className, setClassName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // 年度は編集画面が無く、間違えると直せないため保存前に検証する
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setError("年度は2000から2100までの数字で入力してください");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await createCohort({ year, className });
      navigate("/roster", { replace: true });
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "クラスを作れませんでした。もう一度お試しください",
      );
      setSaving(false);
    }
  }

  async function handleRestoreFile(file: File) {
    setRestoreError(null);
    setRestoring(true);

    const text = await file.text();
    try {
      const backup = parseBackup(text);
      // /setup に到達できるのは有効なcohortが無いときだけ（SetupGateによる）
      // なので、消えるデータが無い。確認ダイアログを挟まず即座に復元する。
      await restoreBackup(backup);
      navigate("/roster", { replace: true });
    } catch (cause: unknown) {
      setRestoreError(
        cause instanceof InvalidBackupError
          ? cause.message
          : "このファイルは読み込めませんでした。バックアップファイルを選び直してください",
      );
      setRestoring(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="font-display text-ai text-3xl">クラスをつくる</h1>
      <p className="mt-2 text-sm">
        はじめに、この端末で使うクラスを登録します。
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">年度</span>
          <input
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="border-ai font-num rounded border-2 px-3 py-2 text-xl"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">クラス名</span>
          <input
            type="text"
            value={className}
            placeholder="5年1組"
            onChange={(event) => setClassName(event.target.value)}
            className="border-ai rounded border-2 px-3 py-2 text-xl"
          />
        </label>

        {error !== null && (
          <p role="alert" className="text-sm font-bold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-ai text-gayoshi rounded px-4 py-3 font-bold disabled:opacity-50"
        >
          クラスをつくる
        </button>
      </form>

      <div className="border-kogan mt-8 border-t pt-6">
        <p className="text-sm">
          機種変更などで前のデータを引き継ぐ場合は、バックアップファイルを選んでください。
        </p>
        <label className="mt-3 block">
          <span className="sr-only">復元するファイル</span>
          <input
            type="file"
            accept="application/json"
            aria-label="復元するファイル"
            disabled={restoring}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) {
                void handleRestoreFile(file);
              }
              event.target.value = "";
            }}
            className="text-sm disabled:opacity-50"
          />
        </label>

        {restoreError !== null && (
          <p role="alert" className="mt-2 text-sm font-bold">
            {restoreError}
          </p>
        )}
      </div>
    </main>
  );
}
