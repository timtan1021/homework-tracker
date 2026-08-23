import { Link } from "react-router";
import { AppHeader } from "../components/AppHeader";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { RosterGrid } from "../components/RosterGrid";
import { useSetting } from "../hooks/useSetting";
import { useStudents } from "../hooks/useStudents";

function RosterBody() {
  const cohort = useActiveCohort();
  const students = useStudents(cohort.id);
  const showNames = useSetting("showStudentNames");
  const hint = useSetting("rosterHintDismissed");

  if (students.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (students.status === "error") {
    return <FullScreenMessage tone="error">{students.message}</FullScreenMessage>;
  }

  const list = students.data;
  const activeCount = list.filter((s) => s.status === "active").length;
  const missingCount = list.length - activeCount;
  const showHint = list.length > 0 && !hint.loading && !hint.value;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <AppHeader
        cohort={cohort}
        subtitle={`在籍${activeCount}人・欠番${missingCount}`}
      />

      {showHint && (
        <div className="border-kogan flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
          <span>番号をタップすると編集できます</span>
          <button
            type="button"
            onClick={() => void hint.update(true)}
            className="text-ai shrink-0 font-bold underline"
          >
            閉じる
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-ai py-12 text-center">まず出席番号を追加してください</p>
      ) : (
        <RosterGrid students={list} showName={showNames.value} />
      )}

      <nav className="mt-auto flex gap-3 pt-4">
        <Link
          to="/roster/new"
          className="bg-ai flex-1 rounded px-4 py-3 text-center font-bold text-gayoshi"
        >
          生徒を追加
        </Link>
        <Link
          to="/print"
          className="border-ai text-ai flex-1 rounded border-2 px-4 py-3 text-center font-bold"
        >
          QRを印刷
        </Link>
      </nav>
    </main>
  );
}

export function Roster() {
  return (
    <CohortGate>
      <RosterBody />
    </CohortGate>
  );
}
