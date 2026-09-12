import { useState } from "react";
import { Link } from "react-router";
import { CheckTable } from "../components/CheckTable";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DateStepper } from "../components/DateStepper";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { ProgressBar } from "../components/ProgressBar";
import type { Student, SubmissionType } from "../db/schema";
import { markAbsent, unmarkAbsent } from "../db/submissions";
import { useDailyRoster } from "../hooks/useDailyRoster";
import { useRecentNonSubmissionCounts } from "../hooks/useRecentNonSubmissionCounts";
import { useSetting } from "../hooks/useSetting";
import { dateFromKey, formatDateHeading, toDateKey } from "../lib/date";

type Pending = {
  studentId: string;
  submissionTypeId: string;
  attendanceNumber: number;
  action: "markAbsent" | "unmarkAbsent";
};

const DATE_LABELS = { prev: "← 前日", next: "翌日 →", backToToday: "今日へ" };

const EMPTY_ROSTER = { columns: [], rows: [], activeCount: 0 };

function UnsubmittedBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の時刻で固定する。Scan画面と同じ理由:
  // 朝の数分で使い切る画面で、開きっぱなしを想定しない。日付送りで見ている
  // date はこれとは別に動く。
  const [now] = useState(() => new Date());
  const [today] = useState(() => toDateKey(now));
  const [date, setDate] = useState(today);
  const isToday = date === today;

  const roster = useDailyRoster(cohort.id, date, now);
  const counts = useRecentNonSubmissionCounts(cohort.id, date, now);
  const showNames = useSetting("showStudentNames");

  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (roster.status === "error") {
    return <FullScreenMessage tone="error">{roster.message}</FullScreenMessage>;
  }
  if (counts.status === "error") {
    return <FullScreenMessage tone="error">{counts.message}</FullScreenMessage>;
  }

  // 再読み込み中は前回の一覧が無いので空として扱う。日付を送るたびに
  // 全画面の読み込み表示に戻すと、ヘッダーとDateStepperごと消えて
  // 押した直後の位置が分からなくなる(Grading.tsx・Scan.tsxと同じ理由)。
  const rosterData = roster.status === "ready" ? roster.data : EMPTY_ROSTER;
  const countsData = counts.status === "ready" ? counts.data : [];

  const completed = rosterData.columns.filter(
    (column) =>
      rosterData.activeCount > 0 &&
      column.submittedCount >= rosterData.activeCount,
  );

  function changeDate(next: string): void {
    setDate(next);
    setPending(null);
    setError(null);
  }

  function reload(): void {
    roster.reload();
    counts.reload();
  }

  function handleCellTap(
    student: Student,
    type: SubmissionType,
    state: "none" | "absent",
  ): void {
    setPending({
      studentId: student.id,
      submissionTypeId: type.id,
      attendanceNumber: student.attendanceNumber,
      action: state === "absent" ? "unmarkAbsent" : "markAbsent",
    });
  }

  function confirmPending(): void {
    if (pending === null) {
      return;
    }
    const action =
      pending.action === "markAbsent"
        ? markAbsent({
            cohortId: cohort.id,
            studentId: pending.studentId,
            submissionTypeId: pending.submissionTypeId,
            date,
          })
        : unmarkAbsent({
            studentId: pending.studentId,
            submissionTypeId: pending.submissionTypeId,
            date,
          });
    setPending(null);
    setError(null);
    void action
      .then(reload)
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
      });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <h1 className="font-display text-ai text-2xl">
          {formatDateHeading(dateFromKey(date))}
        </h1>
        <Link to="/roster" className="text-ai shrink-0 p-2 font-bold underline">
          名簿へ
        </Link>
      </header>

      <DateStepper
        date={date}
        today={today}
        onChange={changeDate}
        labels={DATE_LABELS}
      />

      {error !== null && (
        <p role="alert" className="text-sm font-bold">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-ai text-xl">
          {isToday ? "今日の提出状況" : "この日の提出状況"}
        </h2>

        {roster.status === "ready" && rosterData.columns.length === 0 ? (
          <p>
            {isToday
              ? "今日は確認する提出物がありません"
              : "この日は確認する提出物がありません"}
          </p>
        ) : rosterData.columns.length > 0 ? (
          <>
            {completed.map((column) => (
              <p
                key={column.type.id}
                className="bg-yamabuki text-sumi rounded px-3 py-2 font-bold"
              >
                {column.type.name} 全員提出
              </p>
            ))}

            <div className="flex flex-col gap-2">
              {rosterData.columns.map((column) => (
                <ProgressBar
                  key={column.type.id}
                  label={column.type.name}
                  value={column.submittedCount}
                  max={rosterData.activeCount}
                />
              ))}
            </div>

            <CheckTable
              roster={rosterData}
              showNames={showNames.value}
              now={now}
              date={date}
              onCellTap={handleCellTap}
            />
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 id="recent-heading" className="font-display text-ai text-xl">
          直近2週間で未提出が多い生徒
        </h2>

        {countsData.length === 0 ? (
          <p>未提出はありません</p>
        ) : (
          <ul aria-labelledby="recent-heading" className="flex flex-col gap-2">
            {countsData.map(({ student, count }) => (
              <li
                key={student.id}
                className="border-kogan flex items-center justify-between border-b pb-2"
              >
                <span className="font-num font-bold">
                  {student.attendanceNumber}番
                  {showNames.value && student.name !== ""
                    ? ` ${student.name}`
                    : ""}
                </span>
                <span className="font-num font-bold">{count}回</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pending !== null && (
        <ConfirmDialog
          title={
            pending.action === "markAbsent"
              ? `${pending.attendanceNumber}番を欠席にしますか`
              : `${pending.attendanceNumber}番の欠席を取り消しますか`
          }
          message={
            pending.action === "markAbsent"
              ? "この提出物についてだけ、未提出から除きます"
              : "未提出に戻します"
          }
          confirmLabel={
            pending.action === "markAbsent" ? "欠席にする" : "取り消す"
          }
          onCancel={() => {
            setPending(null);
            setError(null);
          }}
          onConfirm={confirmPending}
        />
      )}
    </main>
  );
}

export function Unsubmitted() {
  return (
    <CohortGate>
      <UnsubmittedBody />
    </CohortGate>
  );
}
