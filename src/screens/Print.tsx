import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { PrintSheet } from "../components/PrintSheet";
import { useSetting } from "../hooks/useSetting";
import { useStudents } from "../hooks/useStudents";

function PrintBody() {
  const cohort = useActiveCohort();
  const students = useStudents(cohort.id);
  const showNames = useSetting("showStudentNames");

  if (students.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (students.status === "error") {
    return <FullScreenMessage tone="error">{students.message}</FullScreenMessage>;
  }

  const active = students.data.filter((student) => student.status === "active");

  if (active.length === 0) {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="font-display text-ai text-2xl">QRを印刷</h1>
        <p className="mt-6">在籍している生徒が居ないため印刷できません</p>
        <Link to="/roster" className="text-ai mt-6 inline-block underline">
          名簿に戻る
        </Link>
      </main>
    );
  }

  return (
    <>
      <div className="no-print mx-auto max-w-3xl p-4">
        <h1 className="font-display text-ai text-2xl">QRを印刷</h1>
        <p className="mt-2 text-sm">
          A4に{active.length}枚のカードを刷ります。破線で切り、ラミネートして
          ドリルの表紙に貼ってください。
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-ai rounded px-4 py-3 font-bold text-gayoshi"
          >
            印刷する
          </button>
          <Link
            to="/roster"
            className="border-ai text-ai rounded border-2 px-4 py-3 font-bold"
          >
            名簿に戻る
          </Link>
        </div>
      </div>

      {/*
        A4実寸（190mm）はスマホ幅より広いので画面では横スクロールが要る。
        ただし overflow が visible 以外の要素はCSSの断片化で分割不能になり、
        中の break-after: page が無視されて全ページが1枚に切り詰められる。
        そのため印刷時は overflow: visible に戻している（index.css の
        @media print 内）。この指定を消すと3ページ分が1枚になる。
      */}
      <div className="print-preview overflow-x-auto">
        <PrintSheet
          cohort={cohort}
          students={active}
          showName={showNames.value}
        />
      </div>
    </>
  );
}

export function Print() {
  return (
    <CohortGate>
      <PrintBody />
    </CohortGate>
  );
}
