import { useState } from "react";
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { NumberPad } from "../components/NumberPad";
import { ScanResult } from "../components/ScanResult";
import { SubmissionToggleBar } from "../components/SubmissionToggleBar";
import { recordSubmission, type RecordResult } from "../db/submissions";
import { useStudents } from "../hooks/useStudents";
import { useSubmissions } from "../hooks/useSubmissions";
import { useSubmissionTypes } from "../hooks/useSubmissionTypes";
import { formatDateHeading, toDateKey } from "../lib/date";

function ScanBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の日付で固定する。日付をまたいで開きっぱなしに
  // することは想定しない（朝の数分で使い切る画面のため）。
  const [today] = useState(() => new Date());
  const date = toDateKey(today);

  const students = useStudents(cohort.id);
  const types = useSubmissionTypes(cohort.id);
  const submissions = useSubmissions(cohort.id, date);

  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [result, setResult] = useState<RecordResult | null>(null);

  // 提出記録の再読み込みでは全画面の読み込み表示に戻さない。
  // 記録するたびに画面が差し替わると、出したばかりの花丸と結果が
  // 一瞬で消えてしまい、先生が読めたかどうか分からなくなる。
  if (students.status === "loading" || types.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (students.status === "error") {
    return <FullScreenMessage tone="error">{students.message}</FullScreenMessage>;
  }
  if (types.status === "error") {
    return <FullScreenMessage tone="error">{types.message}</FullScreenMessage>;
  }
  if (submissions.status === "error") {
    return (
      <FullScreenMessage tone="error">{submissions.message}</FullScreenMessage>
    );
  }

  // 再読み込み中は前回の一覧が無いので空として扱う。進捗の人数が
  // 一瞬0に見えるだけで、記録そのものには影響しない。
  const recorded =
    submissions.status === "ready" ? submissions.data : [];

  const activeTypes = types.data.filter((type) => type.status === "active");
  const todayTypes = activeTypes.filter((type) =>
    type.weekdays.includes(today.getDay()),
  );

  // 初期状態は全部ON。毎朝すべてを確認するのが通常で、
  // 先生が毎回選び直す手間を省く。
  const selected = selectedIds ?? todayTypes.map((type) => type.id);

  const activeStudents = students.data.filter(
    (student) => student.status === "active",
  );

  const doneIds = activeStudents
    .filter((student) =>
      selected.every((typeId) =>
        recorded.some(
          (submission) =>
            submission.studentId === student.id &&
            submission.submissionTypeId === typeId,
        ),
      ),
    )
    .map((student) => student.id);

  function toggle(id: string): void {
    setSelectedIds(
      selected.includes(id)
        ? selected.filter((current) => current !== id)
        : [...selected, id],
    );
  }

  function pick(studentId: string): void {
    void recordSubmission({
      cohortId: cohort.id,
      studentId,
      submissionTypeIds: selected,
      date,
    }).then((next) => {
      setResult(next);
      submissions.reload();
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <h1 className="font-display text-ai text-2xl">
          {formatDateHeading(today)}
        </h1>
        <Link to="/roster" className="text-ai shrink-0 p-2 font-bold underline">
          名簿へ
        </Link>
      </header>

      {activeTypes.length === 0 ? (
        <div className="py-12 text-center">
          <p>まず提出物を登録してください</p>
          <Link
            to="/submissions"
            className="bg-ai mt-4 inline-block rounded px-4 py-3 font-bold text-gayoshi"
          >
            提出物の設定
          </Link>
        </div>
      ) : todayTypes.length === 0 ? (
        <p className="py-12 text-center">今日が提出日の宿題はありません</p>
      ) : (
        <>
          <SubmissionToggleBar
            types={todayTypes}
            selectedIds={selected}
            onToggle={toggle}
          />

          <ScanResult result={result} />

          {selected.length === 0 ? (
            <p className="py-8 text-center font-bold">
              チェックする提出物を選んでください
            </p>
          ) : (
            <NumberPad
              students={activeStudents}
              doneIds={doneIds}
              onPick={pick}
            />
          )}

          <p className="mt-auto pt-4 text-sm">
            {todayTypes
              .map((type) => {
                const count = recorded.filter(
                  (submission) => submission.submissionTypeId === type.id,
                ).length;
                return `${type.name} ${count}人`;
              })
              .join("・")}
          </p>
        </>
      )}
    </main>
  );
}

export function Scan() {
  return (
    <CohortGate>
      <ScanBody />
    </CohortGate>
  );
}
