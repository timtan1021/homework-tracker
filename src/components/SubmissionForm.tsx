import { useState, type FormEvent } from "react";
import { WeekdayPicker } from "./WeekdayPicker";

export type SubmissionFormValues = {
  name: string;
  deadline: string;
  weekdays: number[];
};

export function SubmissionForm({
  defaultValues,
  error,
  submitting,
  primaryLabel,
  onSubmit,
}: {
  defaultValues: SubmissionFormValues;
  error: string | null;
  submitting: boolean;
  primaryLabel: string;
  onSubmit: (values: SubmissionFormValues) => void;
}) {
  // props からの同期用 useEffect は置かない。
  // 初回描画から effect 実行までの間に入力された値を上書きしてしまうため。
  const [name, setName] = useState(defaultValues.name);
  const [deadline, setDeadline] = useState(defaultValues.deadline);
  const [weekdays, setWeekdays] = useState(defaultValues.weekdays);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ name, deadline, weekdays });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">提出物の名前</span>
        <input
          type="text"
          value={name}
          placeholder="計算ドリル"
          onChange={(event) => setName(event.target.value)}
          className="border-ai rounded border-2 px-3 py-2 text-xl"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">締切時刻</span>
        <input
          type="time"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
          className="border-ai font-num w-40 rounded border-2 px-3 py-2 text-2xl"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">提出する曜日</span>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} />
      </div>

      {error !== null && (
        <p role="alert" className="text-sm font-bold">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-ai rounded px-4 py-3 font-bold text-gayoshi disabled:opacity-50"
      >
        {primaryLabel}
      </button>
    </form>
  );
}
