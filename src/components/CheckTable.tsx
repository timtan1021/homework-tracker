import type { CellState, DailyRoster } from "../db/dailyRoster";
import type { Student, SubmissionType } from "../db/schema";
import { minutesUntil, toDateKey } from "../lib/date";

/**
 * 提出チェック表。縦に在籍生徒、横にその日の提出物。
 *
 * 幅の式(375px幅、内寸343px):
 *   生徒列 96px(w-24) + 提出物列 (セル44px + 左右のpadding 4px×2 = 52px) × N
 *   N=3: 252px / N=4: 304px / N=5: 356px
 * 5列以上は外側の overflow-x-auto の中だけ横に流れ、生徒列は sticky で残る。
 * ページ本体は横に動かさない。列幅を変えるときはこの式を計算し直すこと。
 *
 * 提出済みのセルは押せない。取り消しはスキャン画面と採点画面の役割で、
 * この画面に削除を持ち込まない。
 */
export function CheckTable({
  roster,
  showNames,
  now,
  date,
  onCellTap,
}: {
  roster: DailyRoster;
  showNames: boolean;
  now: Date;
  /** 表示中の日付("YYYY-MM-DD")。列見出しの残り時間表示に使う。 */
  date: string;
  onCellTap: (
    student: Student,
    type: SubmissionType,
    state: "none" | "absent",
  ) => void;
}) {
  const isFutureDate = date > toDateKey(now);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">その日の提出状況</caption>
        <thead>
          <tr className="border-kogan border-b align-bottom">
            <th
              scope="col"
              className="bg-gayoshi sticky left-0 w-24 pb-2 text-left text-sm font-bold"
            >
              生徒
            </th>
            {roster.columns.map((column) => (
              <th
                key={column.type.id}
                scope="col"
                className="px-1 pb-2 text-center text-sm font-bold"
              >
                <span className="block">{column.type.name}</span>
                <span className="font-num block">
                  {column.submittedCount}/{roster.activeCount}
                </span>
                <span
                  className={
                    column.deadlinePassed
                      ? "bg-sumi mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold text-gayoshi"
                      : isFutureDate
                        ? "border-ai text-ai font-num mt-1 inline-block rounded border px-2 py-0.5 text-xs font-bold"
                        : "border-ai text-ai mt-1 inline-block rounded border px-2 py-0.5 text-xs font-bold"
                  }
                >
                  {column.deadlinePassed
                    ? "確定"
                    : isFutureDate
                      ? `締切 ${column.type.deadline}`
                      : `あと${minutesUntil(column.type.deadline, now)}分`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roster.rows.map((row) => (
            <tr key={row.student.id} className="border-kogan border-b">
              <th
                scope="row"
                className="bg-gayoshi sticky left-0 py-1 text-left font-normal"
              >
                <span className="font-num text-[2rem] leading-none font-bold">
                  {row.student.attendanceNumber}
                </span>
                {showNames && row.student.name !== "" && (
                  <span className="ml-1 text-sm">{row.student.name}</span>
                )}
              </th>
              {roster.columns.map((column) => (
                <td key={column.type.id} className="px-1 py-1 text-center">
                  <Cell
                    state={row.cells[column.type.id] ?? "none"}
                    label={`${row.student.attendanceNumber}番 ${column.type.name}`}
                    onTap={(state) => onCellTap(row.student, column.type, state)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  state,
  label,
  onTap,
}: {
  state: CellState;
  label: string;
  onTap: (state: "none" | "absent") => void;
}) {
  if (state === "submitted") {
    return (
      <span
        role="img"
        aria-label={`${label} 提出済み`}
        className="bg-yamabuki-usu text-sumi font-num inline-flex size-11 items-center justify-center rounded text-xl font-bold"
      >
        ✓
      </span>
    );
  }

  if (state === "absent") {
    return (
      <button
        type="button"
        aria-label={`${label} 欠席`}
        data-status="absent"
        onClick={() => onTap("absent")}
        className="border-kogan text-sumi hatch font-num inline-flex size-11 items-center justify-center rounded border-2 border-dashed text-sm font-bold"
      >
        欠
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={`${label} 未提出`}
      data-status="none"
      onClick={() => onTap("none")}
      className="border-kogan inline-flex size-11 rounded border-2"
    />
  );
}
