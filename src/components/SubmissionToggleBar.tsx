import type { SubmissionType } from "../db/schema";

export function SubmissionToggleBar({
  types,
  selectedIds,
  onToggle,
}: {
  types: SubmissionType[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {types.map((type) => {
        const selected = selectedIds.includes(type.id);

        return (
          <button
            key={type.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(type.id)}
            className={[
              "min-h-11 rounded px-4 py-2 text-left font-bold",
              selected
                ? "bg-ai text-gayoshi"
                : "border-kogan text-sumi border-2",
            ].join(" ")}
          >
            <span className="block">{type.name}</span>
            <span className="font-num block text-sm font-normal">
              {type.deadline}
            </span>
          </button>
        );
      })}
    </div>
  );
}
