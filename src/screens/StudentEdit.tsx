import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CohortGate } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { StudentForm, type StudentFormValues } from "../components/StudentForm";
import {
  deleteStudent,
  getStudent,
  restoreStudent,
  transferOutStudent,
  updateStudent,
} from "../db/students";
import { useAsync } from "../hooks/useAsync";
import { useSetting } from "../hooks/useSetting";

type Pending = "transferOut" | "delete" | null;

function StudentEditBody({ studentId }: { studentId: string }) {
  const navigate = useNavigate();
  const showNames = useSetting("showStudentNames");
  const loaded = useAsync(() => getStudent(studentId), `student:${studentId}`);

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
      <FullScreenMessage tone="error">この生徒は見つかりません</FullScreenMessage>
    );
  }

  const student = loaded.data;
  const transferredOut = student.status === "transferredOut";

  async function run(action: () => Promise<unknown>): Promise<void> {
    setSubmitting(true);
    setError(null);

    try {
      await action();
      navigate("/roster");
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "保存できませんでした。もう一度お試しください",
      );
      setSubmitting(false);
    }
  }

  function handleSubmit(values: StudentFormValues) {
    void run(() =>
      updateStudent(student.id, {
        attendanceNumber: values.attendanceNumber,
        name: values.name,
      }),
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">
        {student.attendanceNumber}番を編集
      </h1>

      <div className="mt-6">
        <StudentForm
          key={student.id}
          defaultNumber={student.attendanceNumber}
          defaultName={student.name}
          showName={showNames.value}
          error={error}
          submitting={submitting}
          primaryLabel="保存する"
          onSubmit={handleSubmit}
        />
      </div>

      <section className="border-kogan mt-10 border-t pt-6">
        <h2 className="font-display text-ai text-lg">在籍の変更</h2>

        {transferredOut ? (
          <>
            <p className="mt-2 text-sm">
              いまは転出として扱っています。出席番号{student.attendanceNumber}
              は欠番のままです。
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void run(() => restoreStudent(student.id))}
              className="border-ai text-ai mt-3 rounded border-2 px-4 py-2 font-bold disabled:opacity-50"
            >
              在籍に戻す
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm">
              転出にすると名簿から在籍が外れますが、出席番号
              {student.attendanceNumber}は欠番として残ります。印刷済みのQRカードと
              番号がずれません。
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setPending("transferOut")}
              className="border-ai text-ai mt-3 rounded border-2 px-4 py-2 font-bold disabled:opacity-50"
            >
              転出にする
            </button>
          </>
        )}
      </section>

      <section className="border-kogan mt-8 border-t pt-6">
        <h2 className="font-display text-lg">記録を消す</h2>
        <p className="mt-2 text-sm">
          完全に削除すると出席番号{student.attendanceNumber}
          を他の生徒に使えるようになります。転出とは違い、記録は残りません。
        </p>
        <button
          type="button"
          disabled={submitting}
          onClick={() => setPending("delete")}
          className="text-shu mt-3 font-bold underline disabled:opacity-50"
        >
          完全に削除
        </button>
      </section>

      <Link to="/roster" className="text-ai mt-8 inline-block underline">
        名簿に戻る
      </Link>

      {pending === "transferOut" && (
        <ConfirmDialog
          title="転出にしますか"
          message={`出席番号${student.attendanceNumber}は欠番として残ります。`}
          confirmLabel="転出にする"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run(() => transferOutStudent(student.id));
          }}
        />
      )}

      {pending === "delete" && (
        <ConfirmDialog
          title="完全に削除しますか"
          message="この生徒の記録は元に戻せません"
          confirmLabel="削除する"
          tone="danger"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run(() => deleteStudent(student.id));
          }}
        />
      )}
    </main>
  );
}

export function StudentEdit() {
  const { id } = useParams();

  if (id === undefined) {
    return (
      <FullScreenMessage tone="error">この生徒は見つかりません</FullScreenMessage>
    );
  }

  return (
    <CohortGate>
      <StudentEditBody studentId={id} />
    </CohortGate>
  );
}
