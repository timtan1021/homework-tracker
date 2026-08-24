import type { ReactNode } from "react";
import { Link } from "react-router";

export function FullScreenMessage({
  children,
  tone = "normal",
  showBackLink,
}: {
  children: ReactNode;
  tone?: "normal" | "error";
  /**
   * 名簿へ戻る導線を出すか。既定はエラーのときだけ出す。
   *
   * 読み込み中は一瞬で消えるうえ利用者に打つ手がないため出さない。
   * エラーは終端状態なので導線が要る。ステップ6でホーム画面から起動する
   * 形になるとブラウザの戻るボタンが無くなり、導線が無いと詰むため。
   *
   * 名簿そのものが開けない状況（ストレージ利用不可、名簿画面自身のエラー）
   * では行き先が無いので、呼び出し側で false を渡して抑制する。
   */
  showBackLink?: boolean;
}) {
  const withBackLink = showBackLink ?? tone === "error";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6"
    >
      <p
        className={`max-w-sm text-center ${
          tone === "error" ? "text-sumi font-bold" : "text-ai"
        }`}
      >
        {children}
      </p>

      {withBackLink && (
        <Link to="/roster" className="text-ai font-bold underline">
          名簿に戻る
        </Link>
      )}
    </div>
  );
}
