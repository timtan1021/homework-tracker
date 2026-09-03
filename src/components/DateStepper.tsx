import { addDays } from "../lib/date";

export function DateStepper({
  date,
  today,
  onChange,
  labels,
  min,
  max,
}: {
  date: string;
  today: string;
  onChange: (next: string) => void;
  labels: { prev: string; next: string; backToToday: string };
  min?: string;
  max?: string;
}) {
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  // 前後どちらかの1日先が「今日」とちょうど一致するときは、その方向の
  // ボタンを出さない。出すと「今日へ」ボタンと行き先が重なり、
  // 違う見た目で同じ移動をする2つのボタンが並んでしまう。
  const showPrev =
    (min === undefined || prevDate >= min) && prevDate !== today;
  const showNext =
    (max === undefined || nextDate <= max) && nextDate !== today;
  const showBackToToday = date !== today;

  return (
    <div className="flex gap-2">
      {showPrev && (
        <button
          type="button"
          onClick={() => onChange(prevDate)}
          className="border-ai text-ai min-h-11 rounded border-2 px-4 font-bold"
        >
          {labels.prev}
        </button>
      )}
      {showBackToToday && (
        <button
          type="button"
          onClick={() => onChange(today)}
          className="bg-ai min-h-11 rounded px-4 font-bold text-gayoshi"
        >
          {labels.backToToday}
        </button>
      )}
      {showNext && (
        <button
          type="button"
          onClick={() => onChange(nextDate)}
          className="border-ai text-ai min-h-11 rounded border-2 px-4 font-bold"
        >
          {labels.next}
        </button>
      )}
    </div>
  );
}
