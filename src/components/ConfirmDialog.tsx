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

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
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
          className={`font-display text-xl ${
            tone === "danger" ? "text-shu" : "text-ai"
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
            className="border-ai text-ai flex-1 rounded border-2 px-4 py-2 font-bold"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded px-4 py-2 font-bold text-gayoshi ${
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
