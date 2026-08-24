import { Link } from "react-router";
import type { SubmissionType } from "../db/schema";
import { formatWeekdays } from "../lib/weekdays";

export function SubmissionRow({
  type,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  type: SubmissionType;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  const ended = type.status === "ended";

  return (
    <div
      data-testid="submission-row"
      data-status={type.status}
      className={[
        "flex items-center gap-2 rounded p-3",
        ended
          ? "border-kogan text-kogan hatch border-2 border-dashed"
          : "border-ai text-sumi border-2",
      ].join(" ")}
    >
      <Link to={`/submissions/${type.id}/edit`} className="min-w-0 flex-1">
        <span className="block truncate font-bold">
          {ended ? `${type.name}（終了）` : type.name}
        </span>
        <span className="mt-1 flex gap-3 text-sm">
          <span className="font-num">{type.deadline}</span>
          <span>{formatWeekdays(type.weekdays)}</span>
        </span>
      </Link>

      {!ended && (
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            aria-label="上へ"
            disabled={!canMoveUp}
            onClick={() => onMove("up")}
            className="border-ai text-ai size-11 rounded border-2 font-bold disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="下へ"
            disabled={!canMoveDown}
            onClick={() => onMove("down")}
            className="border-ai text-ai size-11 rounded border-2 font-bold disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      )}
    </div>
  );
}
