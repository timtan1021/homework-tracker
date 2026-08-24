import type { Student } from "../db/schema";
import { Hanamaru } from "./Hanamaru";

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
                // 朱は花丸そのものにだけ使う。枠線や文字を朱にすると
                // 「丸がついた」という記号が薄まる。
                done ? "border-kogan text-sumi" : "border-ai text-sumi",
              ].join(" ")}
            >
              {/* 提出済みは花丸を番号に重ねる。先生が普段つける印そのもの。 */}
              <span className="relative flex items-center justify-center">
                {done && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Hanamaru className="size-14 opacity-70" />
                  </span>
                )}
                <span className="font-num text-[2rem] leading-none font-bold">
                  {student.attendanceNumber}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
