import { useState } from "react";
import { Link } from "react-router";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { backupFileName, buildBackup } from "../backup/export";
import { parseBackup, restoreBackup } from "../backup/import";
import { InvalidBackupError, type BackupFile } from "../backup/types";
import { useSetting } from "../hooks/useSetting";

function SettingsBody() {
  const cohort = useActiveCohort();
  const showNames = useSetting("showStudentNames");

  const [pendingRestore, setPendingRestore] = useState<BackupFile | null>(
    null,
  );
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function handleExport() {
    const backup = await buildBackup(cohort.id);
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = backupFileName();
    link.click();

    URL.revokeObjectURL(url);
  }

  async function handleFileSelected(file: File) {
    setRestoreError(null);

    const text = await file.text();
    try {
      const backup = parseBackup(text);
      setPendingRestore(backup);
    } catch (cause: unknown) {
      setRestoreError(
        cause instanceof InvalidBackupError
          ? cause.message
          : "このファイルは読み込めませんでした。バックアップファイルを選び直してください",
      );
    }
  }

  async function confirmRestore() {
    if (pendingRestore === null) {
      return;
    }
    setRestoring(true);
    await restoreBackup(pendingRestore);
    // 復元で cohort そのものが別のIDに入れ替わる。useActiveCohort が
    // 参照する値をはじめ、アプリ内の状態をすべて作り直すより、ページを
    // 丸ごと作り直すほうが単純で確実。復元は頻繁に起きる操作ではないため
    // この単純さを優先する。
    location.reload();
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">設定</h1>

      {/*
        説明文をlabelの中に入れると読み上げ名が説明ごと連結されてしまう。
        aria-labelledby で見出しだけを名前にし、説明は describedby にする。
      */}
      <div className="border-kogan mt-6 flex items-start gap-3 border-b pb-4">
        <input
          id="show-names"
          type="checkbox"
          checked={showNames.value}
          disabled={showNames.loading}
          onChange={(event) => void showNames.update(event.target.checked)}
          aria-labelledby="show-names-label"
          aria-describedby="show-names-description"
          className="mt-1 size-5 disabled:opacity-50"
        />
        <div>
          <label id="show-names-label" htmlFor="show-names" className="font-bold">
            氏名を表示する
          </label>
          <p id="show-names-description" className="mt-1 text-sm">
            名簿と印刷シートに氏名を出します。切っても入力した氏名は残ります。
          </p>
        </div>
      </div>

      {showNames.error !== null && (
        <p role="alert" className="mt-3 text-sm font-bold">
          {showNames.error}
        </p>
      )}

      <section className="border-kogan mt-8 border-b pb-6">
        <h2 className="font-display text-ai text-lg">バックアップ</h2>
        <p className="mt-2 text-sm">
          いまのクラスのデータをファイルに書き出します。機種変更や
          万一の故障に備えて、定期的に書き出しておくと安心です。
        </p>
        <button
          type="button"
          onClick={() => void handleExport()}
          className="border-ai text-ai mt-3 min-h-11 rounded border-2 px-4 py-2 font-bold"
        >
          バックアップを書き出す
        </button>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-ai text-lg">復元</h2>
        <p className="mt-2 text-sm">
          バックアップファイルを選ぶと、いまのクラスのデータを消して
          ファイルの内容に置き換えます。
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
                void handleFileSelected(file);
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
      </section>

      <Link to="/roster" className="text-ai mt-8 inline-block underline">
        名簿に戻る
      </Link>

      {pendingRestore !== null && (
        <ConfirmDialog
          title="復元しますか"
          message={`現在のデータ（${cohort.year}年度 ${cohort.className}）を消して、選んだファイルの内容に置き換えます。元に戻せません。`}
          confirmLabel="復元する"
          tone="danger"
          onCancel={() => setPendingRestore(null)}
          onConfirm={() => void confirmRestore()}
        />
      )}
    </main>
  );
}

export function Settings() {
  return (
    <CohortGate>
      <SettingsBody />
    </CohortGate>
  );
}
