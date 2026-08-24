import type { Student } from "../db/schema";

export function NumberPad({
  students,
  doneIds,
  onPick,
}: {
  students: Student[];
  /** 選択中の提出物をすべて出し終えた生徒 */
  doneIds: string[];
  onPick: (studentId: string) => void;
}) {
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
      {students.map((student) => {
        const done = doneIds.includes(student.id);

        return (
          <li key={student.id}>
            <button
              type="button"
              data-testid="number-cell"
              data-done={done}
              aria-label={`${student.attendanceNumber}番`}
              onClick={() => onPick(student.id)}
              className={[
                "flex aspect-square min-h-16 w-full flex-col items-center justify-center rounded border-2",
                done ? "border-shu text-shu" : "border-ai text-sumi",
              ].join(" ")}
            >
              <span className="font-num text-[2rem] leading-none font-bold">
                {student.attendanceNumber}
              </span>
              {done && <span className="text-xs">済</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
