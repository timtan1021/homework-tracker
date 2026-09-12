import { useState } from "react";
import { Link } from "react-router";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DateStepper } from "../components/DateStepper";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { clearGrade, gradeSubmission, type GradingItem } from "../db/grading";
import { deleteSubmission } from "../db/submissions";
import { useGradingItems } from "../hooks/useGradingItems";
import { useSetting } from "../hooks/useSetting";
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
  onWithdraw,
  menuOpen,
  onToggleMenu,
  showName,
}: {
  item: GradingItem;
  onGrade: (id: string, grade: "passed" | "resubmit") => void;
  onClear?: (item: GradingItem) => void;
  onWithdraw?: (item: GradingItem) => void;
  menuOpen: boolean;
  onToggleMenu: (id: string) => void;
  showName: boolean;
}) {
  const { submission, student } = item;
  const dateLabel = formatDateHeading(dateFromKey(submission.date));
  const timing = submissionTiming(submission.date, submission.submittedAt);
  const timingLabel =
    timing === "late" ? "遅れて提出" : timing === "early" ? "先に提出" : "";
  const who = `${dateLabel}の${student.attendanceNumber}番（${item.type.name}）`;

  return (
    <li className="border-kogan flex flex-col border-b py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-2">
          {onClear !== undefined && (
            <span className="font-num text-sm">{dateLabel}</span>
          )}
          <span className="font-num text-[2rem] leading-none font-bold">
            {student.attendanceNumber}
          </span>
          {showName && student.name !== "" && (
            <span className="text-sm">{student.name}</span>
          )}
          {timingLabel !== "" && (
            <span className="text-sm">・{timingLabel}</span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={`${who}を合格にする`}
            onClick={() => onGrade(submission.id, "passed")}
            className="bg-yamabuki text-sumi min-h-11 rounded px-3 font-bold"
          >
            合格
          </button>
          {onClear === undefined ? (
            <button
              type="button"
              aria-label={`${who}を再提出にする`}
              onClick={() => onGrade(submission.id, "resubmit")}
              className="border-ai text-ai min-h-11 rounded border-2 px-3 font-bold"
            >
              再提出
            </button>
          ) : (
            <button
              type="button"
              aria-label={`${who}を未採点に戻す`}
              onClick={() => onClear(item)}
              className="text-ai min-h-11 px-3 font-bold underline"
            >
              未採点に戻す
            </button>
          )}
          {onWithdraw !== undefined && (
            <button
              type="button"
              aria-label={`${who}のその他の操作`}
              aria-expanded={menuOpen}
              onClick={() => onToggleMenu(submission.id)}
              className="text-ai size-11 rounded font-bold"
            >
              ⋯
            </button>
          )}
        </div>
      </div>
      {onWithdraw !== undefined && menuOpen && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            aria-label={`${who}の提出を取り消す`}
            onClick={() => onWithdraw(item)}
            className="text-ai min-h-11 px-3 font-bold underline"
          >
            提出を取り消す
          </button>
        </div>
      )}
    </li>
  );
}

type Tab = "ungraded" | "resubmit";

function GradingBody() {
  const cohort = useActiveCohort();
  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState(today);
  const items = useGradingItems(cohort.id, date);
  const showNames = useSetting("showStudentNames");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("ungraded");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingWithdraw, setPendingWithdraw] = useState<GradingItem | null>(
    null,
  );

  if (items.status === "error") {
    return <FullScreenMessage tone="error">{items.message}</FullScreenMessage>;
  }

  function changeDate(next: string): void {
    setError(null);
    setOpenMenuId(null);
    setDate(next);
  }

  function grade(id: string, value: "passed" | "resubmit"): void {
    setError(null);
    setOpenMenuId(null);
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

  function withdraw(item: GradingItem): void {
    setError(null);
    setOpenMenuId(null);
    void deleteSubmission(item.submission.id)
      .then(() => items.reload())
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "保存できませんでした。もう一度お試しください",
        );
      });
  }

  function toggleMenu(id: string): void {
    setOpenMenuId((current) => (current === id ? null : id));
  }

  function requestWithdraw(item: GradingItem): void {
    setOpenMenuId(null);
    setPendingWithdraw(item);
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

  const tabClass = (selected: boolean) =>
    [
      "flex min-h-11 flex-1 items-center justify-center gap-2 rounded font-bold",
      selected ? "bg-ai text-gayoshi" : "border-ai text-ai border-2",
    ].join(" ");

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

      <div role="tablist" aria-label="採点の区分" className="flex gap-2">
        <button
          role="tab"
          id="tab-ungraded"
          type="button"
          aria-selected={tab === "ungraded"}
          aria-controls="panel-ungraded"
          onClick={() => {
            setOpenMenuId(null);
            setTab("ungraded");
          }}
          className={tabClass(tab === "ungraded")}
        >
          未採点
          <span className="bg-yamabuki text-sumi font-num rounded-full px-2 text-sm">
            {data.ungraded.length}
          </span>
        </button>
        <button
          role="tab"
          id="tab-resubmit"
          type="button"
          aria-selected={tab === "resubmit"}
          aria-controls="panel-resubmit"
          onClick={() => {
            setOpenMenuId(null);
            setTab("resubmit");
          }}
          className={tabClass(tab === "resubmit")}
        >
          再提出待ち
          <span className="bg-yamabuki text-sumi font-num rounded-full px-2 text-sm">
            {data.resubmitPending.length}
          </span>
        </button>
      </div>

      {tab === "ungraded" ? (
        <section
          role="tabpanel"
          id="panel-ungraded"
          aria-labelledby="tab-ungraded"
          className="flex flex-col gap-5"
        >
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
            <p className="bg-yamabuki text-sumi rounded px-3 py-2 font-bold">
              未採点の提出物はありません
            </p>
          ) : (
            ungradedGroups.map((group) => (
              <div key={group.typeId} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <p className="font-bold">{group.typeName}</p>
                  <span className="font-num text-sm">あと{group.items.length}件</span>
                </div>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <GradingRow
                      key={item.submission.id}
                      item={item}
                      onGrade={grade}
                      onWithdraw={requestWithdraw}
                      menuOpen={openMenuId === item.submission.id}
                      onToggleMenu={toggleMenu}
                      showName={showNames.value}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      ) : (
        <section
          role="tabpanel"
          id="panel-resubmit"
          aria-labelledby="tab-resubmit"
          className="flex flex-col gap-5"
        >
          {resubmitGroups.length === 0 ? (
            <p>再提出待ちの生徒はいません</p>
          ) : (
            resubmitGroups.map((group) => (
              <div key={group.typeId} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <p className="font-bold">{group.typeName}</p>
                  <span className="font-num text-sm">{group.items.length}人</span>
                </div>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <GradingRow
                      key={item.submission.id}
                      item={item}
                      onGrade={grade}
                      onClear={clear}
                      menuOpen={false}
                      onToggleMenu={toggleMenu}
                      showName={showNames.value}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}

      {pendingWithdraw !== null && (
        <ConfirmDialog
          title="提出を取り消しますか"
          message="この提出の記録を完全に削除し、未提出に戻します。元に戻せません。"
          confirmLabel="取り消す"
          tone="danger"
          onCancel={() => setPendingWithdraw(null)}
          onConfirm={() => {
            const item = pendingWithdraw;
            setPendingWithdraw(null);
            withdraw(item);
          }}
        />
      )}
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
