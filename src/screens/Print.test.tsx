import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  COLUMN_GAP_MM,
  COLUMNS,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  ROW_GAP_MM,
  ROWS,
  TITLE_HEIGHT_MM,
  TITLE_MARGIN_MM,
} from "../components/PrintSheet";
import { createCohort } from "../db/cohorts";
import { setSetting } from "../db/settings";
import { addStudent, transferOutStudent } from "../db/students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderPrint() {
  return render(
    <MemoryRouter initialEntries={["/print"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

async function addStudents(count: number): Promise<void> {
  for (let number = 1; number <= count; number += 1) {
    await addStudent({ cohortId, attendanceNumber: number });
  }
}

describe("印刷するカード", () => {
  it("在籍者のカードを作る", async () => {
    await addStudents(3);
    renderPrint();

    expect(await screen.findAllByTestId("qr-card")).toHaveLength(3);
  });

  it("転出した生徒のカードは作らない", async () => {
    await addStudents(3);
    const out = await addStudent({ cohortId, attendanceNumber: 4 });
    await transferOutStudent(out.id);

    renderPrint();

    const cards = await screen.findAllByTestId("qr-card");
    expect(cards).toHaveLength(3);
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("カードに出席番号とQRを載せる", async () => {
    await addStudents(1);
    renderPrint();

    const card = (await screen.findAllByTestId("qr-card"))[0];
    expect(within(card).getByText("1")).toBeInTheDocument();
    // QR描画はuseEffect内の非同期状態更新なので、DOM反映を待つ。
    await waitFor(() => {
      expect(card.querySelector("svg")).not.toBeNull();
    });
  });
});

describe("ページ分け", () => {
  it("12枚までは1ページ", async () => {
    await addStudents(12);
    renderPrint();

    expect(await screen.findAllByTestId("print-page")).toHaveLength(1);
  });

  it("13枚で2ページになる", async () => {
    await addStudents(13);
    renderPrint();

    expect(await screen.findAllByTestId("print-page")).toHaveLength(2);
  });

  it("34人なら3ページになる", async () => {
    await addStudents(34);
    renderPrint();

    const pages = await screen.findAllByTestId("print-page");
    expect(pages).toHaveLength(3);
    expect(within(pages[0]).getAllByTestId("qr-card")).toHaveLength(12);
    expect(within(pages[2]).getAllByTestId("qr-card")).toHaveLength(10);
  });

  it("どのページにも年度とクラス名を刷る", async () => {
    await addStudents(13);
    renderPrint();

    const pages = await screen.findAllByTestId("print-page");
    for (const page of pages) {
      expect(within(page).getByText("2026年度 5年1組")).toBeInTheDocument();
    }
  });
});

describe("氏名の表示設定", () => {
  it("OFFなら氏名を刷らない", async () => {
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });
    renderPrint();

    await screen.findAllByTestId("qr-card");
    expect(screen.queryByText("やまだ")).not.toBeInTheDocument();
  });

  it("ONなら氏名を刷る", async () => {
    await setSetting("showStudentNames", true);
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });
    renderPrint();

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });
});

describe("生徒が居ないとき", () => {
  it("印刷できないことを伝える", async () => {
    renderPrint();

    expect(
      await screen.findByText("在籍している生徒が居ないため印刷できません"),
    ).toBeInTheDocument();
  });
});

// jsdomはmm単位のレイアウトを実測できないため、CSS（src/styles/index.css）と
// 二重管理している寸法定数の関係式そのものを検証する。値を変えるときは
// index.css の計算コメントとこのテストの両方を必ず合わせて直すこと。
describe("印刷レイアウトの寸法", () => {
  it("カードの横幅がA4印字領域に収まる", () => {
    const totalWidth = COLUMNS * CARD_WIDTH_MM + (COLUMNS - 1) * COLUMN_GAP_MM;
    expect(totalWidth).toBeLessThanOrEqual(PAGE_WIDTH_MM);
  });

  it("見出し込みでカードの縦幅がA4印字領域に収まる", () => {
    const totalHeight =
      TITLE_HEIGHT_MM +
      TITLE_MARGIN_MM +
      ROWS * CARD_HEIGHT_MM +
      (ROWS - 1) * ROW_GAP_MM;
    expect(totalHeight).toBeLessThanOrEqual(PAGE_HEIGHT_MM);
  });
});
