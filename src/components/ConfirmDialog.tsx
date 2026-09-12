import { useEffect, useRef } from "react";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = "normal",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "normal" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
        return;
      }

      // 背面のページにフォーカスが逃げないよう2つのボタンの間で循環させる。
      // 記録を消せるダイアログなので、意図しない場所を押せる状態にしない。
      if (event.key !== "Tab") {
        return;
      }
      const cancel = cancelRef.current;
      const confirm = confirmRef.current;
      if (cancel === null || confirm === null) {
        return;
      }
      event.preventDefault();
      // ボタンは2つなので Tab も Shift+Tab も「もう一方」へ移る
      const next = document.activeElement === cancel ? confirm : cancel;
      next.focus();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="bg-gayoshi w-full max-w-sm rounded p-5"
      >
        <h2
          // 朱はコントラスト比が約4.3:1のため18pt以上でのみ使う
          className={`font-display ${
            tone === "danger" ? "text-shu text-2xl" : "text-ai text-xl"
          }`}
        >
          {title}
        </h2>
        <p className="mt-2 text-sm">{message}</p>

        <div className="mt-5 flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="border-ai text-ai min-h-11 flex-1 rounded border-2 px-4 py-2 font-bold"
          >
            やめる
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`min-h-11 flex-1 rounded px-4 py-2 font-bold text-gayoshi ${
              tone === "danger" ? "bg-shu" : "bg-ai"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
