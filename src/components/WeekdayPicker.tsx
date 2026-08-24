import { WEEKDAY_LABELS } from "../lib/weekdays";

export function WeekdayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (next: number[]) => void;
}) {
  function toggle(day: number): void {
    const next = value.includes(day)
      ? value.filter((current) => current !== day)
      : [...value, day];

    onChange(next.sort((a, b) => a - b));
  }

  return (
    // 44px x7 + 間隔4px x6 = 332px。375px幅（内寸343px）に収まる。
    // ボタンを大きくするときはこの式を計算し直すこと。
    <div className="flex gap-1">
      {WEEKDAY_LABELS.map((label, day) => {
        const selected = value.includes(day);

        return (
          <button
            key={label}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(day)}
            className={[
              "size-11 shrink-0 rounded font-bold",
              selected
                ? "bg-ai text-gayoshi"
                : "border-kogan text-sumi border-2",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
