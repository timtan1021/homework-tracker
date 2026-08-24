import type { RecordResult } from "../db/submissions";
import { Hanamaru } from "./Hanamaru";

/** 直前のスキャン結果。何も読んでいなければ高さだけ確保する。 */
export function ScanResult({ result }: { result: RecordResult | null }) {
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
        : "転出しています";

  return (
    <div
      data-testid="scan-result"
      role="status"
      className="flex min-h-28 flex-col items-center justify-center gap-1"
    >
      {result.kind === "recorded" && <Hanamaru />}
      <span className="font-num text-3xl font-bold">{number}</span>
      <span className="font-bold">{message}</span>
    </div>
  );
}
