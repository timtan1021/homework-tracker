import { Link } from "react-router";
import { AppHeader } from "../components/AppHeader";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { SubmissionRow } from "../components/SubmissionRow";
import { moveSubmissionType } from "../db/submissionTypes";
import { useSubmissionTypes } from "../hooks/useSubmissionTypes";

function SubmissionListBody() {
  const cohort = useActiveCohort();
  const types = useSubmissionTypes(cohort.id);

  if (types.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (types.status === "error") {
    return <FullScreenMessage tone="error">{types.message}</FullScreenMessage>;
  }

  const list = types.data;
  const active = list.filter((type) => type.status === "active");
  const ended = list.filter((type) => type.status === "ended");

  // 終了したものは並べ替えの対象外なので末尾へ回す
  const ordered = [...active, ...ended];

  function handleMove(id: string, direction: "up" | "down"): void {
    void moveSubmissionType(id, direction).then(() => types.reload());
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <AppHeader
        cohort={cohort}
        subtitle={`提出物${active.length}件・終了${ended.length}`}
      />

      {list.length === 0 ? (
        <p className="text-ai py-12 text-center">まず提出物を追加してください</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ordered.map((type) => {
            const index = active.findIndex((current) => current.id === type.id);

            return (
              <li key={type.id}>
                <SubmissionRow
                  type={type}
                  canMoveUp={index > 0}
                  canMoveDown={index !== -1 && index < active.length - 1}
                  onMove={(direction) => handleMove(type.id, direction)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <nav className="mt-auto flex gap-3 pt-4">
        <Link
          to="/submissions/new"
          className="bg-ai flex-1 rounded px-4 py-3 text-center font-bold text-gayoshi"
        >
          提出物を追加
        </Link>
        <Link
          to="/roster"
          className="border-ai text-ai flex-1 rounded border-2 px-4 py-3 text-center font-bold"
        >
          名簿に戻る
        </Link>
      </nav>
    </main>
  );
}

export function SubmissionList() {
  return (
    <CohortGate>
      <SubmissionListBody />
    </CohortGate>
  );
}
