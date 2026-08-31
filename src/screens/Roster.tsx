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
    // 名簿画面自身のエラーなので、名簿へのリンクは行き先が同じで無意味
    return (
      <FullScreenMessage tone="error" showBackLink={false}>
        {students.message}
      </FullScreenMessage>
    );
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

      <nav className="mt-auto flex flex-col gap-3 pt-4">
        <Link
          to="/scan"
          className="bg-ai rounded px-4 py-4 text-center text-xl font-bold text-gayoshi"
        >
          提出チェック
        </Link>
        <Link
          to="/roster/new"
          className="border-ai text-ai rounded border-2 px-4 py-3 text-center font-bold"
        >
          生徒を追加
        </Link>
        <div className="flex gap-3">
          <Link
            to="/print"
            className="border-ai text-ai flex-1 rounded border-2 px-4 py-3 text-center font-bold"
          >
            QRを印刷
          </Link>
          <Link
            to="/submissions"
            className="border-ai text-ai flex-1 rounded border-2 px-4 py-3 text-center font-bold"
          >
            提出物の設定
          </Link>
        </div>
        <Link
          to="/unsubmitted"
          className="border-ai text-ai rounded border-2 px-4 py-3 text-center font-bold"
        >
          未提出者・集計を見る
        </Link>
        <Link
          to="/calendar"
          className="border-ai text-ai rounded border-2 px-4 py-3 text-center font-bold"
        >
          宿題をカレンダーで登録
        </Link>
        <Link
          to="/grading"
          className="border-ai text-ai rounded border-2 px-4 py-3 text-center font-bold"
        >
          採点する
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
