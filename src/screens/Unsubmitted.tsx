import { useState } from "react";
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { markAbsent, unmarkAbsent } from "../db/submissions";
import { useRecentNonSubmissionCounts } from "../hooks/useRecentNonSubmissionCounts";
import { useTodayNonSubmitters } from "../hooks/useTodayNonSubmitters";
import { formatDateHeading, toDateKey } from "../lib/date";

/** "HH:mm" の締切まであと何分か。負の値にはならない呼び出し方を前提とする。 */
function minutesUntil(deadline: string, now: Date): number {
  const [hours, minutes] = deadline.split(":").map(Number);
  const deadlineMinutes = hours * 60 + minutes;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return deadlineMinutes - nowMinutes;
}

type Pending = {
  studentId: string;
  submissionTypeId: string;
  attendanceNumber: number;
  action: "markAbsent" | "unmarkAbsent";
};

function UnsubmittedBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の時刻で固定する。Scan画面と同じ理由:
  // 朝の数分で使い切る画面で、開きっぱなしを想定しない。
  const [now] = useState(() => new Date());
  const date = toDateKey(now);

  const groups = useTodayNonSubmitters(cohort.id, date, now);
  const counts = useRecentNonSubmissionCounts(cohort.id, date, now);

  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (groups.status === "loading" || counts.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (groups.status === "error") {
    return <FullScreenMessage tone="error">{groups.message}</FullScreenMessage>;
  }
  if (counts.status === "error") {
    return <FullScreenMessage tone="error">{counts.message}</FullScreenMessage>;
  }

  function reload(): void {
    groups.reload();
    counts.reload();
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
          {formatDateHeading(now)}
        </h1>
        <Link to="/roster" className="text-ai shrink-0 p-2 font-bold underline">
          名簿へ
        </Link>
      </header>

      {error !== null && (
        <p role="alert" className="text-sm font-bold">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-5">
        <h2 className="font-display text-ai text-xl">今日の未提出</h2>

        {groups.data.length === 0 ? (
          <p>今日は確認する提出物がありません</p>
        ) : (
          groups.data.map((group) => (
            <div key={group.type.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">
                  {group.type.name}・締切{group.type.deadline}
                </p>
                <span
                  className={
                    group.deadlinePassed
                      ? "bg-sumi rounded px-2 py-1 text-sm font-bold text-gayoshi"
                      : "border-ai text-ai rounded border px-2 py-1 text-sm font-bold"
                  }
                >
                  {group.deadlinePassed
                    ? "確定"
                    : `あと${minutesUntil(group.type.deadline, now)}分`}
                </span>
              </div>

              {group.students.length === 0 ? (
                <p className="text-sm">{group.type.name}は全員提出しました</p>
              ) : (
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                  {group.students.map(({ student, status }) => {
                    const absent = status === "absent";
                    const label = absent
                      ? `${student.attendanceNumber}番（欠席）`
                      : `${student.attendanceNumber}番`;

                    return (
                      <li key={student.id}>
                        <button
                          type="button"
                          data-testid="unsubmitted-cell"
                          data-status={status}
                          aria-label={label}
                          onClick={() =>
                            setPending({
                              studentId: student.id,
                              submissionTypeId: group.type.id,
                              attendanceNumber: student.attendanceNumber,
                              action: absent ? "unmarkAbsent" : "markAbsent",
                            })
                          }
                          className={[
                            "flex aspect-square min-h-16 w-full items-center justify-center rounded",
                            absent
                              ? "border-kogan text-kogan hatch border-2 border-dashed"
                              : "border-ai text-sumi border-2",
                          ].join(" ")}
                        >
                          <span className="font-num text-[2rem] leading-none font-bold">
                            {student.attendanceNumber}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-ai text-xl">
          直近2週間で未提出が多い生徒
        </h2>

        {counts.data.length === 0 ? (
          <p>未提出はありません</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {counts.data.map(({ student, count }) => (
              <li
                key={student.id}
                className="border-kogan flex items-center justify-between border-b pb-2"
              >
                <span className="font-num font-bold">
                  {student.attendanceNumber}番
                  {student.name !== "" ? ` ${student.name}` : ""}
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
          onCancel={() => setPending(null)}
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
