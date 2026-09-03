import { useState } from "react";
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { DateStepper } from "../components/DateStepper";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { clearGrade, gradeSubmission, type GradingItem } from "../db/grading";
import { useGradingItems } from "../hooks/useGradingItems";
import {
  dateFromKey,
  formatDateHeading,
  submissionTiming,
  toDateKey,
} from "../lib/date";

type TypeGroup = { typeId: string; typeName: string; items: GradingItem[] };

const DATE_LABELS = { prev: "← 前日", next: "翌日 →", backToToday: "今日へ" };

/**
 * 提出物ごとにまとめる。日付指定の提出物はorderが常に0のため、同日締切の
 * 複数項目が並ぶと表示順→日付のタイブレークが同点になり、出席番号だけで
 * 順位が決まって同じ提出物のitemが配列上で連続しないことがある。そのため
 * 配列の隣接ではなくtype.idをキーにしたMapでグルーピングする。itemsは
 * 既にtype.order順に並んでいるため、Mapの挿入順をそのままグループの
 * 並び順として使える。
 */
function groupByType(items: GradingItem[]): TypeGroup[] {
  const groups = new Map<string, TypeGroup>();
  for (const item of items) {
    const existing = groups.get(item.type.id);
    if (existing !== undefined) {
      existing.items.push(item);
    } else {
      groups.set(item.type.id, {
        typeId: item.type.id,
        typeName: item.type.name,
        items: [item],
      });
    }
  }
  return [...groups.values()];
}

function GradingRow({
  item,
  onGrade,
  onClear,
}: {
  item: GradingItem;
  onGrade: (id: string, grade: "passed" | "resubmit") => void;
  onClear?: (item: GradingItem) => void;
}) {
  const { submission, student } = item;
  const dateLabel = formatDateHeading(dateFromKey(submission.date));
  const nameLabel = `${student.attendanceNumber}番${student.name}`;
  const timing = submissionTiming(submission.date, submission.submittedAt);
  const timingLabel =
    timing === "late" ? "・遅れて提出" : timing === "early" ? "・先に提出" : "";

  return (
    <li className="border-kogan flex items-center justify-between gap-2 border-b py-2">
      <span className="font-num">
        {dateLabel} {nameLabel}
        {timingLabel}
      </span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          aria-label={`${dateLabel}の${student.attendanceNumber}番（${item.type.name}）を合格にする`}
          onClick={() => onGrade(submission.id, "passed")}
          className="bg-ai min-h-11 rounded px-3 font-bold text-gayoshi"
        >
          合格
        </button>
        {onClear === undefined ? (
          <button
            type="button"
            aria-label={`${dateLabel}の${student.attendanceNumber}番（${item.type.name}）を再提出にする`}
            onClick={() => onGrade(submission.id, "resubmit")}
            className="border-ai text-ai min-h-11 rounded border-2 px-3 font-bold"
          >
            再提出
          </button>
        ) : (
          <button
            type="button"
            aria-label={`${dateLabel}の${student.attendanceNumber}番（${item.type.name}）を未採点に戻す`}
            onClick={() => onClear(item)}
            className="text-ai min-h-11 px-3 font-bold underline"
          >
            未採点に戻す
          </button>
        )}
      </div>
    </li>
  );
}

function GradingBody() {
  const cohort = useActiveCohort();
  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState(today);
  const items = useGradingItems(cohort.id, date);
  const [error, setError] = useState<string | null>(null);

  if (items.status === "error") {
    return <FullScreenMessage tone="error">{items.message}</FullScreenMessage>;
  }

  function changeDate(next: string): void {
    setError(null);
    setDate(next);
  }

  function grade(id: string, value: "passed" | "resubmit"): void {
    setError(null);
    void gradeSubmission(id, value)
      .then(() => items.reload())
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
      });
  }

  function clear(item: GradingItem): void {
    setError(null);
    void clearGrade(item.submission.id)
      .then(() => {
        const receivedDate = toDateKey(new Date(item.submission.submittedAt));
        if (receivedDate === date) {
          items.reload();
        } else {
          changeDate(receivedDate);
        }
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
      });
  }

  // 再読み込み中は前回の一覧が無いので空として扱う。日付を送るたびに
  // 全画面の読み込み表示に戻すと、ヘッダーとDateStepperごと消えて
  // 押した直後の位置が分からなくなる(Scan.tsx の submissions と同じ理由)。
  const data =
    items.status === "ready"
      ? items.data
      : {
          ungraded: [],
          resubmitPending: [],
          otherDaysUngradedCount: 0,
          oldestUngradedDate: null,
        };

  const ungradedGroups = groupByType(data.ungraded);
  const resubmitGroups = groupByType(data.resubmitPending);
  const oldestUngradedDate = data.oldestUngradedDate;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      <header className="border-kogan flex items-center justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="font-display text-ai text-2xl">採点</h1>
          <p className="mt-1 text-sm font-bold">
            {formatDateHeading(dateFromKey(date))}
          </p>
        </div>
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

      <section className="flex flex-col gap-5">
        <h2 className="font-display text-ai text-xl">未採点</h2>

        {data.otherDaysUngradedCount > 0 && oldestUngradedDate !== null && (
          <button
            type="button"
            onClick={() => changeDate(oldestUngradedDate)}
            className="text-ai min-h-11 self-start px-3 font-bold underline"
          >
            ほかの日に未採点 {data.otherDaysUngradedCount}件 →
            一番古い日へ
          </button>
        )}

        {ungradedGroups.length === 0 ? (
          <p>未採点の提出物はありません</p>
        ) : (
          ungradedGroups.map((group) => (
            <div key={group.typeId} className="flex flex-col gap-1">
              <p className="font-bold">{group.typeName}</p>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <GradingRow
                    key={item.submission.id}
                    item={item}
                    onGrade={grade}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="font-display text-ai text-xl">再提出待ち</h2>

        {resubmitGroups.length === 0 ? (
          <p>再提出待ちの生徒はいません</p>
        ) : (
          resubmitGroups.map((group) => (
            <div key={group.typeId} className="flex flex-col gap-1">
              <p className="font-bold">{group.typeName}</p>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <GradingRow
                    key={item.submission.id}
                    item={item}
                    onGrade={grade}
                    onClear={clear}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

export function Grading() {
  return (
    <CohortGate>
      <GradingBody />
    </CohortGate>
  );
}
