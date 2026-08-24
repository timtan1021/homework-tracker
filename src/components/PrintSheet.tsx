import type { Cohort, Student } from "../db/schema";
import { QrCard } from "./QrCard";

/**
 * 印刷レイアウトの寸法定数（mm）。src/styles/index.css の
 * `.print-page` / `.print-page-title` / `.print-card-grid` / `.qr-card`
 * と値を一致させること。この定数を変えたらCSS側も必ず合わせて直す
 * （CSSはmm単位をそのまま解決できるがjsdomはできないため、
 * 寸法の整合性は Print.test.tsx でこの定数を使って検証している）。
 */
export const PAGE_WIDTH_MM = 190; // A4印字領域の横幅（210mm - 余白10mm×2）
export const PAGE_HEIGHT_MM = 277; // A4印字領域の縦幅（297mm - 余白10mm×2）
export const COLUMNS = 3;
export const ROWS = 4;
export const CARD_WIDTH_MM = 55;
export const CARD_HEIGHT_MM = 60;
export const COLUMN_GAP_MM = 10;
export const ROW_GAP_MM = 6;
export const TITLE_HEIGHT_MM = 6;
export const TITLE_MARGIN_MM = 4;

export const CARDS_PER_PAGE = COLUMNS * ROWS;

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
          <p className="print-page-title text-kogan text-[8pt]">
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
