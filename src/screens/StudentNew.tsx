import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { StudentForm, type StudentFormValues } from "../components/StudentForm";
import { addStudent, nextAttendanceNumber } from "../db/students";
import { useAsync } from "../hooks/useAsync";
import { useSetting } from "../hooks/useSetting";

function StudentNewBody() {
  const cohort = useActiveCohort();
  const navigate = useNavigate();
  const showNames = useSetting("showStudentNames");
  const suggested = useAsync(
    () => nextAttendanceNumber(cohort.id),
    `next-number:${cohort.id}`,
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (suggested.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (suggested.status === "error") {
    return <FullScreenMessage tone="error">{suggested.message}</FullScreenMessage>;
  }

  async function save(values: StudentFormValues): Promise<boolean> {
    setSubmitting(true);
    setError(null);

    try {
      await addStudent({
        cohortId: cohort.id,
        attendanceNumber: values.attendanceNumber,
        name: values.name,
      });
      return true;
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "保存できませんでした。もう一度お試しください",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">生徒を追加</h1>

      <div className="mt-6">
        <StudentForm
          defaultNumber={suggested.data}
          defaultName=""
          showName={showNames.value}
          error={error}
          submitting={submitting}
          primaryLabel="保存する"
          secondaryLabel="保存して続けて追加"
          onSubmit={(values) => {
            void save(values).then((ok) => {
              if (ok) {
                navigate("/roster");
              }
            });
          }}
          onSecondary={(values) => {
            void save(values).then((ok) => {
              if (ok) {
                suggested.reload();
              }
            });
          }}
        />
      </div>

      <Link to="/roster" className="text-ai mt-6 inline-block underline">
        名簿に戻る
      </Link>
    </main>
  );
}

export function StudentNew() {
  return (
    <CohortGate>
      <StudentNewBody />
    </CohortGate>
  );
}
