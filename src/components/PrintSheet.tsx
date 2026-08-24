import type { Cohort, Student } from "../db/schema";
import { QrCard } from "./QrCard";

export const CARDS_PER_PAGE = 12;

function toPages(students: Student[]): Student[][] {
  const pages: Student[][] = [];
  for (let index = 0; index < students.length; index += CARDS_PER_PAGE) {
    pages.push(students.slice(index, index + CARDS_PER_PAGE));
  }
  return pages;
}

export function PrintSheet({
  cohort,
  students,
  showName,
}: {
  cohort: Cohort;
  students: Student[];
  showName: boolean;
}) {
  return (
    <>
      {toPages(students).map((page, pageIndex) => (
        <section
          key={pageIndex}
          data-testid="print-page"
          className="print-page mx-auto bg-white p-0"
        >
          <p className="text-kogan mb-3 text-[8pt]">
            {cohort.year}年度 {cohort.className}
          </p>
          <div className="print-card-grid">
            {page.map((student) => (
              <QrCard key={student.id} student={student} showName={showName} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
