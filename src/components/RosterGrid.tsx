import type { Student } from "../db/schema";
import { StudentCell } from "./StudentCell";

export function RosterGrid({
  students,
  showName,
}: {
  students: Student[];
  showName: boolean;
}) {
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
      {students.map((student) => (
        <li key={student.id}>
          <StudentCell student={student} showName={showName} />
        </li>
      ))}
    </ul>
  );
}
