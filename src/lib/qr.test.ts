import { describe, expect, it } from "vitest";
import { createCohort } from "../db/cohorts";
import { addStudent, updateStudent } from "../db/students";
import { useFreshDb } from "../test/db";
import {
  buildQrPayload,
  parseQrPayload,
  renderQrSvg,
  QR_PAYLOAD_PREFIX,
} from "./qr";

const STUDENT_ID = "9f2c1a84-4d3e-4c1b-8f77-2b6c9a0e51d3";

describe("buildQrPayload", () => {
  it("接頭辞と内部IDを繋げた文字列を返す", () => {
    expect(buildQrPayload(STUDENT_ID)).toBe(`hw1:${STUDENT_ID}`);
  });

  it("接頭辞は hw1: である", () => {
    expect(QR_PAYLOAD_PREFIX).toBe("hw1:");
  });
});

describe("buildQrPayload with database", () => {
  useFreshDb();

  it("出席番号を含まないので、番号を変えてもペイロードは変わらない", async () => {
    // 出席番号は変更されうるが、QRカードは印刷・ラミネート済みで変更できない。
    // ペイロードが内部IDだけから決まることを確認する。

    const cohort = await createCohort({ year: 2024, className: "1年1組" });
    const student1 = await addStudent({
      cohortId: cohort.id,
      attendanceNumber: 12,
      name: "太郎",
    });

    // 出席番号12のペイロードを控える
    const payload1 = buildQrPayload(student1.id);

    // 出席番号を30に変更
    const student2 = await updateStudent(student1.id, {
      attendanceNumber: 30,
      name: "太郎",
    });

    // 変更後のペイロードが同一であることを確認
    const payload2 = buildQrPayload(student2.id);
    expect(payload1).toBe(payload2);

    // ペイロードが hw1: + 生徒IDと完全一致することを確認
    expect(payload1).toBe(`hw1:${student1.id}`);
    expect(payload1).toBe(`hw1:${student2.id}`);
  });
});

describe("renderQrSvg", () => {
  it("SVG文字列を返す", async () => {
    const svg = await renderQrSvg(buildQrPayload(STUDENT_ID));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
  });

  it("同じペイロードからは同じSVGが出る", async () => {
    const payload = buildQrPayload(STUDENT_ID);
    expect(await renderQrSvg(payload)).toBe(await renderQrSvg(payload));
  });

  it("違うペイロードからは違うSVGが出る", async () => {
    const a = await renderQrSvg(buildQrPayload(STUDENT_ID));
    const b = await renderQrSvg(buildQrPayload("00000000-0000-4000-8000-000000000000"));
    expect(a).not.toBe(b);
  });

  it("空文字は拒否する", async () => {
    await expect(renderQrSvg("")).rejects.toThrow();
  });

  it("誤り訂正レベルQ・余白4でラミネート対応のサイズになっている", async () => {
    // ペイロード hw1: + 36文字UUID = 40バイト（バイトモード）
    // 誤り訂正Q（25%）ではバージョン4 = 33×33モジュール
    // 余白（margin）4 は QR規格が要求する静穏帯（クワイエットゾーン）で、
    // 上下左右に4モジュールずつ足されるので、合計41×41モジュールになる。
    // ラミネートしたカードは反射と傷で読み取り率が落ちるため、
    // 誤り訂正レベルをMに下げたり余白を削ったりするとカードが読めなくなる。
    const svg = await renderQrSvg(buildQrPayload(STUDENT_ID));
    expect(svg).toContain('viewBox="0 0 41 41"');
  });
});

describe("parseQrPayload", () => {
  it("接頭辞を外して内部IDを返す", () => {
    expect(parseQrPayload(`hw1:${STUDENT_ID}`)).toBe(STUDENT_ID);
  });

  it("buildQrPayload の出力を元に戻せる", () => {
    expect(parseQrPayload(buildQrPayload(STUDENT_ID))).toBe(STUDENT_ID);
  });

  it("接頭辞が無ければ null を返す", () => {
    // 商品バーコードや他アプリのQRを黙って弾くための接頭辞
    expect(parseQrPayload(STUDENT_ID)).toBeNull();
    expect(parseQrPayload("4901234567894")).toBeNull();
    expect(parseQrPayload("https://example.com")).toBeNull();
  });

  it("接頭辞だけで中身が無ければ null を返す", () => {
    expect(parseQrPayload("hw1:")).toBeNull();
  });

  it("空文字なら null を返す", () => {
    expect(parseQrPayload("")).toBeNull();
  });
});
