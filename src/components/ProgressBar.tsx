/**
 * 提出物1つぶんの進捗。山吹の面で「できた」の量を見せる。
 * 数字は「提出/在籍」。全員なら「全員」に置き換える(数字を読む手間を省く)。
 */
export function ProgressBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const complete = max > 0 && value >= max;
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);

  return (
    <div className="grid grid-cols-[6em_1fr_4em] items-center gap-2">
      <span className="truncate text-sm font-bold">{label}</span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="bg-kogan h-3 overflow-hidden rounded-full"
      >
        <div
          data-testid="progress-fill"
          className="bg-yamabuki h-full rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-num text-right text-sm font-bold">
        {complete ? "全員" : `${value}/${max}`}
      </span>
    </div>
  );
}
