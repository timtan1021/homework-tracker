import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CohortGate } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullScreenMessage } from "../components/FullScreenMessage";
import {
  SubmissionForm,
  type SubmissionFormValues,
} from "../components/SubmissionForm";
import {
  deleteSubmissionType,
  endSubmissionType,
  getSubmissionType,
  restoreSubmissionType,
  updateSubmissionType,
} from "../db/submissionTypes";
import { useAsync } from "../hooks/useAsync";

type Pending = "end" | "delete" | null;

function SubmissionEditBody({ typeId }: { typeId: string }) {
  const navigate = useNavigate();
  const loaded = useAsync(
    () => getSubmissionType(typeId),
    `submission-type:${typeId}`,
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  if (loaded.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (loaded.status === "error") {
    return <FullScreenMessage tone="error">{loaded.message}</FullScreenMessage>;
  }
  if (loaded.data === null) {
    return (
      <FullScreenMessage tone="error">この提出物は見つかりません</FullScreenMessage>
    );
  }

  const type = loaded.data;
  const ended = type.status === "ended";

  function run(action: () => Promise<unknown>): void {
    setSubmitting(true);
    setError(null);

    void action()
      .then(() => navigate("/submissions"))
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
        setSubmitting(false);
      });
  }

  function handleSubmit(values: SubmissionFormValues) {
    run(() => updateSubmissionType(type.id, values));
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">{type.name}を編集</h1>

      <div className="mt-6">
        <SubmissionForm
          key={type.id}
          defaultValues={{
            name: type.name,
            deadline: type.deadline,
            weekdays: type.weekdays,
          }}
          error={error}
          submitting={submitting}
          primaryLabel="保存する"
          onSubmit={handleSubmit}
        />
      </div>

      <section className="border-kogan mt-10 border-t pt-6">
        <h2 className="font-display text-ai text-lg">使用の停止</h2>

        {ended ? (
          <>
            <p className="mt-2 text-sm">
              いまは終了として扱っています。スキャン画面と未提出者一覧には出ません。
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => run(() => restoreSubmissionType(type.id))}
              className="border-ai text-ai mt-3 rounded border-2 px-4 py-2 font-bold disabled:opacity-50"
            >
              有効に戻す
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm">
              終了にすると、スキャン画面と未提出者一覧から外れます。
              これまでの提出記録と集計には残ります。
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setPending("end")}
              className="border-ai text-ai mt-3 rounded border-2 px-4 py-2 font-bold disabled:opacity-50"
            >
              終了にする
            </button>
          </>
        )}
      </section>

      <section className="border-kogan mt-8 border-t pt-6">
        <h2 className="font-display text-lg">記録を消す</h2>
        <p className="mt-2 text-sm">
          完全に削除すると、この提出物の名前を再び使えるようになります。
          終了とは違い、これまでの記録は残りません。
        </p>
        <button
          type="button"
          disabled={submitting}
          onClick={() => setPending("delete")}
          className="text-ai mt-3 font-bold underline disabled:opacity-50"
        >
          完全に削除
        </button>
      </section>

      <Link to="/submissions" className="text-ai mt-8 inline-block underline">
        提出物の一覧に戻る
      </Link>

      {pending === "end" && (
        <ConfirmDialog
          title="終了にしますか"
          message="これまでの提出記録と集計には残ります。"
          confirmLabel="終了にする"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            run(() => endSubmissionType(type.id));
          }}
        />
      )}

      {pending === "delete" && (
        <ConfirmDialog
          title="完全に削除しますか"
          message="この提出物の記録は元に戻せません"
          confirmLabel="削除する"
          tone="danger"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            run(() => deleteSubmissionType(type.id));
          }}
        />
      )}
    </main>
  );
}

export function SubmissionEdit() {
  const { id } = useParams();

  if (id === undefined) {
    return (
      <FullScreenMessage tone="error">この提出物は見つかりません</FullScreenMessage>
    );
  }

  return (
    <CohortGate>
      <SubmissionEditBody typeId={id} />
    </CohortGate>
  );
}
