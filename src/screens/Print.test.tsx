import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
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

  it("シートの包みに print-preview クラスが付いている", async () => {
    // CSS側で印刷時に overflow を戻していても、このクラスが外れると
    // 解除が効かず全ページが1枚に切り詰められる。両方が揃って初めて機能する。
    await addStudents(1);
    renderPrint();

    const page = (await screen.findAllByTestId("print-page"))[0];
    expect(page.closest(".print-preview")).not.toBeNull();
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

// 上の関係式テストは定数同士しか見ていないため、index.css側だけを書き換えても
// 気付けない。ここでは実際にCSSファイルを読み、各宣言のmm値を寸法定数と
// 突き合わせる。値がずれたら（CSSだけ・定数だけ、どちらを直し忘れても）失敗する。
describe("CSSと寸法定数の整合性", () => {
  // print media query内は裁ち線・改ページ制御のみで寸法宣言を含まないが、
  // .print-page セレクタ自体は再掲されるため、そちらを誤って拾わないよう
  // print media query より前の本体だけを対象にする。
  // グローバルの URL（jsdom環境ではブラウザ互換シムに差し替わっており、
  // file: をbaseにした相対解決が http://localhost:3000/... に化けてしまう）
  // ではなく、node:url の実装を明示的に使うこと。
  const cssPath = new NodeURL("../styles/index.css", import.meta.url);
  const css = readFileSync(cssPath, "utf-8");
  const printMediaIndex = css.indexOf("@media print");
  const baseCss = printMediaIndex === -1 ? css : css.slice(0, printMediaIndex);

  function extractBlock(selector: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(baseCss);
    if (match === null) {
      throw new Error(
        `index.css にセレクタ ${selector} のブロックが見つかりません（CSSが変更された可能性があります）`,
      );
    }
    return match[1];
  }

  function extractMm(block: string, selector: string, property: string): number {
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // (?<![\w-]) で "line-height" が "height" に誤マッチしないようにする。
    const match = new RegExp(`(?<![\\w-])${escapedProperty}\\s*:\\s*([\\d.]+)mm`).exec(
      block,
    );
    if (match === null) {
      throw new Error(
        `index.css の ${selector} { ${property} } が見つかりません（CSSが変更された可能性があります）`,
      );
    }
    return Number(match[1]);
  }

  it(".print-page の width が PAGE_WIDTH_MM と一致する", () => {
    const block = extractBlock(".print-page");
    expect(extractMm(block, ".print-page", "width")).toBe(PAGE_WIDTH_MM);
  });

  it(".print-page-title の height と margin-bottom が定数と一致する", () => {
    const block = extractBlock(".print-page-title");
    expect(extractMm(block, ".print-page-title", "height")).toBe(TITLE_HEIGHT_MM);
    expect(extractMm(block, ".print-page-title", "margin-bottom")).toBe(
      TITLE_MARGIN_MM,
    );
  });

  it(".print-card-grid の grid-template-columns が COLUMNS と CARD_WIDTH_MM に一致する", () => {
    const block = extractBlock(".print-card-grid");
    const match = /grid-template-columns\s*:\s*repeat\(\s*(\d+)\s*,\s*([\d.]+)mm\s*\)/.exec(
      block,
    );
    if (match === null) {
      throw new Error(
        "index.css の .print-card-grid { grid-template-columns } が見つかりません（CSSが変更された可能性があります）",
      );
    }
    expect(Number(match[1])).toBe(COLUMNS);
    expect(Number(match[2])).toBe(CARD_WIDTH_MM);
  });

  it(".print-card-grid の column-gap と row-gap が定数と一致する", () => {
    const block = extractBlock(".print-card-grid");
    expect(extractMm(block, ".print-card-grid", "column-gap")).toBe(COLUMN_GAP_MM);
    expect(extractMm(block, ".print-card-grid", "row-gap")).toBe(ROW_GAP_MM);
  });

  it(".qr-card の width と height が定数と一致する", () => {
    const block = extractBlock(".qr-card");
    expect(extractMm(block, ".qr-card", "width")).toBe(CARD_WIDTH_MM);
    expect(extractMm(block, ".qr-card", "height")).toBe(CARD_HEIGHT_MM);
  });

  /*
    印刷プレビューは画面では横スクロールさせるが、overflow が visible 以外の
    要素はCSSの断片化で分割不能になり、中の break-after: page が無視されて
    全ページが1枚に切り詰められる。印刷時に overflow を戻す指定が消えると
    このアプリ唯一の成果物が壊れるので、宣言の存在自体を守る。
    jsdomは印刷メディアもページ分割も評価できないため、CSSの記述を検証する。
  */
  describe("印刷時に横スクロールの overflow を解除する", () => {
    const printMediaCss =
      printMediaIndex === -1 ? "" : css.slice(printMediaIndex);

    it("@media print の中に .print-preview の overflow: visible がある", () => {
      expect(printMediaIndex).toBeGreaterThan(-1);
      expect(printMediaCss).toMatch(
        /\.print-preview\s*\{[^}]*overflow\s*:\s*visible/,
      );
    });

    it("画面側では .print-preview に overflow を指定していない", () => {
      // 画面側のスクロールはTailwindの overflow-x-auto が担う。
      // ここに素のCSSで overflow を書くと印刷時の解除と競合する。
      expect(baseCss).not.toMatch(/\.print-preview\s*\{/);
    });
  });
});
