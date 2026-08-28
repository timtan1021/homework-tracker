import { useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullScreenMessage } from "../components/FullScreenMessage";
import {
  addDateSubmission,
  deleteDateSubmission,
  updateDateSubmissionName,
} from "../db/dateSubmissions";
import { getDefaultDeadline } from "../db/settings";
import { useDateSubmissionsInWeek } from "../hooks/useDateSubmissionsInWeek";
import {
  dateFromKey,
  formatDateHeading,
  startOfWeek,
  toDateKey,
  weekDates,
} from "../lib/date";

type Editing = { date: string; id: string | null; value: string };
type Pending = { id: string; name: string };

/**
 * 週送りボタンの間に出す範囲見出し。例: "8/23 〜 8/29"
 *
 * 各日の見出し(formatDateHeading、"8月23日(日)"形式)と同じ表記を使うと、
 * 週の最初/最後の日の見出しと文字列として重複し、テキストで要素を
 * 探すクエリが同じ文字列を持つ2要素にヒットしてしまう。表記を変えて区別する。
 */
function formatWeekRangeHeading(start: Date, end: Date): string {
  return `${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()}`;
}

function CalendarBody() {
  const cohort = useActiveCohort();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(toDateKey(new Date())),
  );
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const types = useDateSubmissionsInWeek(cohort.id, weekStart);

  if (types.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (types.status === "error") {
    return <FullScreenMessage tone="error">{types.message}</FullScreenMessage>;
  }

  const dates = weekDates(weekStart);
  const byDate = new Map<string, typeof types.data>();
  for (const date of dates) {
    byDate.set(
      date,
      types.data.filter((type) => type.date === date),
    );
  }

  function shiftWeek(days: number): void {
    const next = new Date(dateFromKey(weekStart));
    next.setDate(next.getDate() + days);
    setWeekStart(toDateKey(next));
  }

  function startEditing(date: string, id: string | null, value: string): void {
    setEditError(null);
    setEditing({ date, id, value });
  }

  function cancelEditing(): void {
    setEditing(null);
    setEditError(null);
  }

  async function commitEditing(): Promise<void> {
    if (editing === null) {
      return;
    }
    if (editing.value.trim() === "") {
      setEditError("宿題の名前を入力してください");
      return;
    }

    const current = editing;
    setEditing(null);
    setEditError(null);

    if (current.id === null) {
      const deadline = await getDefaultDeadline();
      await addDateSubmission({
        cohortId: cohort.id,
        name: current.value,
        date: current.date,
        deadline,
      });
    } else {
      await updateDateSubmissionName(current.id, current.value);
    }
    types.reload();
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      cancelEditing();
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <h1 className="font-display text-ai text-2xl">
          宿題をカレンダーで登録
        </h1>
        <Link to="/roster" className="text-ai shrink-0 p-2 font-bold underline">
          名簿へ
        </Link>
      </header>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => shiftWeek(-7)}
          className="border-ai text-ai min-h-11 rounded border-2 px-4 font-bold"
        >
          ← 前週
        </button>
        <span className="font-bold">
          {formatWeekRangeHeading(
            dateFromKey(dates[0]),
            dateFromKey(dates[6]),
          )}
        </span>
        <button
          type="button"
          onClick={() => shiftWeek(7)}
          className="border-ai text-ai min-h-11 rounded border-2 px-4 font-bold"
        >
          次週 →
        </button>
      </div>

      <ul className="flex flex-col gap-4">
        {dates.map((date) => {
          const items = byDate.get(date) ?? [];
          const isAddingHere =
            editing !== null && editing.date === date && editing.id === null;

          return (
            <li key={date} className="border-kogan border-b pb-3">
              <p className="font-bold">{formatDateHeading(dateFromKey(date))}</p>

              <div className="mt-2 flex flex-col gap-2">
                {items.map((type) => {
                  const isEditingThis =
                    editing !== null && editing.id === type.id;

                  if (isEditingThis && editing !== null) {
                    return (
                      <div key={type.id} className="flex flex-col gap-1">
                        <input
                          type="text"
                          value={editing.value}
                          autoFocus
                          onChange={(event) =>
                            setEditing({ ...editing, value: event.target.value })
                          }
                          onBlur={() => void commitEditing()}
                          onKeyDown={handleEditKeyDown}
                          className="border-ai min-h-11 w-full rounded border-2 px-3 py-2"
                        />
                        {editError !== null && (
                          <p role="alert" className="text-sm font-bold">
                            {editError}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={type.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(date, type.id, type.name)}
                        className="border-ai min-h-11 flex-1 rounded border-2 px-3 py-2 text-left"
                      >
                        {type.name}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPending({ id: type.id, name: type.name })
                        }
                        className="text-ai min-h-11 min-w-11 rounded border-2 border-ai px-3 font-bold"
                      >
                        削除
                      </button>
                    </div>
                  );
                })}

                {isAddingHere && editing !== null ? (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      value={editing.value}
                      autoFocus
                      onChange={(event) =>
                        setEditing({ ...editing, value: event.target.value })
                      }
                      onBlur={() => void commitEditing()}
                      onKeyDown={handleEditKeyDown}
                      className="border-ai min-h-11 w-full rounded border-2 px-3 py-2"
                    />
                    {editError !== null && (
                      <p role="alert" className="text-sm font-bold">
                        {editError}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditing(date, null, "")}
                    className="border-kogan text-ai min-h-11 rounded border-2 border-dashed px-3 py-2 text-left text-sm"
                  >
                    {items.length === 0 ? "タップして登録" : "＋もう1件"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pending !== null && (
        <ConfirmDialog
          title={`「${pending.name}」を削除しますか`}
          message="この宿題の登録を取り消します"
          confirmLabel="削除する"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const id = pending.id;
            setPending(null);
            void deleteDateSubmission(id).then(() => types.reload());
          }}
        />
      )}
    </main>
  );
}

export function Calendar() {
  return (
    <CohortGate>
      <CalendarBody />
    </CohortGate>
  );
}
