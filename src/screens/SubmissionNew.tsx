import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import {
  SubmissionForm,
  type SubmissionFormValues,
} from "../components/SubmissionForm";
import { addSubmissionType } from "../db/submissionTypes";

function SubmissionNewBody() {
  const cohort = useActiveCohort();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(values: SubmissionFormValues) {
    setSubmitting(true);
    setError(null);

    void addSubmissionType({ cohortId: cohort.id, ...values })
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

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">提出物を追加</h1>

      <div className="mt-6">
        <SubmissionForm
          defaultValues={{
            name: "",
            deadline: "08:15",
            weekdays: [1, 2, 3, 4, 5],
          }}
          error={error}
          submitting={submitting}
          primaryLabel="保存する"
          onSubmit={handleSubmit}
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
