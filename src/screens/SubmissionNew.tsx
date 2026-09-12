import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import {
  SubmissionForm,
  type SubmissionFormValues,
} from "../components/SubmissionForm";
import { addSubmissionType } from "../db/submissionTypes";

const DEFAULT_VALUES: SubmissionFormValues = {
  name: "",
  deadline: "08:15",
  weekdays: [1, 2, 3, 4, 5],
};

function SubmissionNewBody() {
  const cohort = useActiveCohort();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 続けて追加のたびに変え、SubmissionForm を作り直して入力を空に戻す
  // (StudentForm の key={suggested.data} と同じ理由)。
  const [formKey, setFormKey] = useState(0);

  async function save(values: SubmissionFormValues): Promise<boolean> {
    setSubmitting(true);
    setError(null);

    try {
      await addSubmissionType({ cohortId: cohort.id, ...values });
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
      <h1 className="font-display text-ai text-2xl">提出物を追加</h1>

      <div className="mt-6">
        <SubmissionForm
          key={formKey}
          defaultValues={DEFAULT_VALUES}
          error={error}
          submitting={submitting}
          primaryLabel="保存する"
          secondaryLabel="保存して続けて追加"
          onSubmit={(values) => {
            void save(values).then((ok) => {
              if (ok) {
                navigate("/submissions");
              }
            });
          }}
          onSecondary={(values) => {
            void save(values).then((ok) => {
              if (ok) {
                setFormKey((key) => key + 1);
              }
            });
          }}
        />
      </div>

      <Link to="/submissions" className="text-ai mt-6 inline-block underline">
        提出物の一覧に戻る
      </Link>
    </main>
  );
}

export function SubmissionNew() {
  return (
    <CohortGate>
      <SubmissionNewBody />
    </CohortGate>
  );
}
