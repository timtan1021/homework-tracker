import type { RecordResult } from "../db/submissions";
import { Hanamaru } from "./Hanamaru";

/**
 * 直前のスキャン結果。何も読んでいなければ高さだけ確保する。
 *
 * onWithdraw を渡した画面だけ、「提出済み」のときに「取り消す」を出す。
 * 児童のスキャン画面は渡さない(子供に記録を消させない)。
 */
export function ScanResult({
  result,
  dateLabel,
  onWithdraw,
}: {
  result: RecordResult | null;
  dateLabel?: string;
  onWithdraw?: () => void;
}) {
  if (result === null) {
    return <div data-testid="scan-result" className="min-h-28" />;
  }

  if (result.kind === "notFound") {
    return (
      <div
        data-testid="scan-result"
        role="status"
        className="flex min-h-28 items-center justify-center text-center font-bold"
      >
        このクラスの生徒ではありません
      </div>
    );
  }

  const number = `${result.student.attendanceNumber}番`;

  const message =
    result.kind === "recorded"
      ? "提出しました"
      : result.kind === "already"
        ? "提出済み"
        : result.kind === "withdrawn"
          ? "取り消しました"
          : "転出しています";

  return (
    <div
      data-testid="scan-result"
      role="status"
      className="flex min-h-28 flex-col items-center justify-center gap-1"
    >
      {result.kind === "recorded" && <Hanamaru />}
      {dateLabel !== undefined && (
        <span className="font-bold">{dateLabel}の記録</span>
      )}
      <span className="font-num text-3xl font-bold">{number}</span>
      <span className="font-bold">{message}</span>
      {result.kind === "already" && onWithdraw !== undefined && (
        <button
          type="button"
          onClick={onWithdraw}
          className="border-ai text-ai mt-1 min-h-11 rounded border-2 px-4 font-bold"
        >
          取り消す
        </button>
      )}
    </div>
  );
}
