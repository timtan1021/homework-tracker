import { useEffect, useState, type FormEvent } from "react";

export type StudentFormValues = { attendanceNumber: number; name: string };

export function StudentForm({
  defaultNumber,
  defaultName,
  showName,
  error,
  submitting,
  primaryLabel,
  secondaryLabel,
  onSubmit,
  onSecondary,
}: {
  defaultNumber: number;
  defaultName: string;
  showName: boolean;
  error: string | null;
  submitting: boolean;
  primaryLabel: string;
  secondaryLabel?: string;
  onSubmit: (values: StudentFormValues) => void;
  onSecondary?: (values: StudentFormValues) => void;
}) {
  const [numberText, setNumberText] = useState(String(defaultNumber));
  const [name, setName] = useState(defaultName);

  // 「保存して続けて追加」の後に次の番号へ進める
  useEffect(() => {
    setNumberText(String(defaultNumber));
  }, [defaultNumber]);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  function values(): StudentFormValues {
    return { attendanceNumber: Number(numberText), name };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">出席番号</span>
        <input
          type="number"
          inputMode="numeric"
          value={numberText}
          onChange={(event) => setNumberText(event.target.value)}
          className="border-ai font-num w-32 rounded border-2 px-3 py-2 text-2xl"
        />
      </label>

      {showName && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">氏名</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="border-ai rounded border-2 px-3 py-2 text-xl"
          />
        </label>
      )}

      {error !== null && (
        <p role="alert" className="text-sm font-bold">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="bg-ai rounded px-4 py-3 font-bold text-gayoshi disabled:opacity-50"
        >
          {primaryLabel}
        </button>

        {secondaryLabel !== undefined && onSecondary !== undefined && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSecondary(values())}
            className="border-ai text-ai rounded border-2 px-4 py-3 font-bold disabled:opacity-50"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </form>
  );
}
