import { Link } from "react-router";
import type { Student } from "../db/schema";

export function StudentCell({
  student,
  showName,
}: {
  student: Student;
  showName: boolean;
}) {
  const transferredOut = student.status === "transferredOut";
  const label = transferredOut
    ? `${student.attendanceNumber}番（転出）`
    : `${student.attendanceNumber}番`;

  return (
    <Link
      to={`/roster/${student.id}/edit`}
      data-testid="student-cell"
      data-status={student.status}
      aria-label={label}
      className={[
        "flex aspect-square min-h-16 flex-col items-center justify-center rounded",
        transferredOut
          ? "border-kogan text-kogan hatch border-2 border-dashed"
          : "border-ai text-sumi border-2",
      ].join(" ")}
    >
      <span className="font-num text-[2rem] leading-none font-bold">
        {student.attendanceNumber}
      </span>
      {showName && student.name !== "" && (
        <span className="mt-1 max-w-full truncate px-1 text-[10px]">
          {student.name}
        </span>
      )}
    </Link>
  );
}
