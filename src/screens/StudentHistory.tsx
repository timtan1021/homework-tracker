import { Link, useParams } from "react-router";
import { CohortGate } from "../components/CohortGate";
import { FullScreenMessage } from "../components/FullScreenMessage";
import type { Submission } from "../db/schema";
import { useStudentHistory } from "../hooks/useStudentHistory";
import { dateFromKey, formatDateHeading, submissionTiming } from "../lib/date";

function statusLabel(submission: Submission): string {
  if (submission.status === "absent") {
    return "欠席";
  }
  if (submission.grade === "passed") {
    return "合格";
  }
  if (submission.grade === "resubmit") {
    return "再提出待ち";
  }
  return "未採点";
}

/** Grading画面と同じ配色文法(合格=塗りつぶし、再提出待ち=輪郭)。欠席・未採点は装飾しない。 */
function statusClassName(submission: Submission): string {
  if (submission.grade === "passed") {
    return "bg-ai shrink-0 rounded px-2 py-1 text-sm font-bold text-gayoshi";
  }
  if (submission.grade === "resubmit") {
    return "border-ai text-ai shrink-0 rounded border px-2 py-1 text-sm font-bold";
  }
  return "text-sumi shrink-0 text-sm font-bold";
}

function timingLabel(submission: Submission): string {
  if (submission.status === "absent") {
    return "";
  }
  const timing = submissionTiming(submission.date, submission.submittedAt);
  return timing === "late"
    ? "・遅れて提出"
    : timing === "early"
      ? "・先に提出"
      : "";
}

function StudentHistoryBody({ studentId }: { studentId: string }) {
  const history = useStudentHistory(studentId);

  if (history.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (history.status === "error") {
    return <FullScreenMessage tone="error">{history.message}</FullScreenMessage>;
  }
  if (history.data === null) {
    return (
      <FullScreenMessage tone="error">この生徒は見つかりません</FullScreenMessage>
    );
  }

  const { student, entries } = history.data;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <h1 className="font-display text-ai text-2xl">
          {student.attendanceNumber}番の提出履歴
        </h1>
        <Link
          to={`/roster/${student.id}/edit`}
          className="text-ai shrink-0 p-2 font-bold underline"
        >
          編集へ戻る
        </Link>
      </header>

      {entries.length === 0 ? (
        <p>まだ提出記録がありません</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map(({ submission, typeName }) => (
            <li
              key={submission.id}
              className="border-kogan flex items-center justify-between gap-2 border-b pb-2"
            >
              <span className="font-num">
                {formatDateHeading(dateFromKey(submission.date))} {typeName}
                {timingLabel(submission)}
              </span>
              <span className={statusClassName(submission)}>
                {statusLabel(submission)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function StudentHistory() {
  const { id } = useParams();

  if (id === undefined) {
    return (
      <FullScreenMessage tone="error">この生徒は見つかりません</FullScreenMessage>
    );
  }

  return (
    <CohortGate>
      <StudentHistoryBody studentId={id} />
    </CohortGate>
  );
}
