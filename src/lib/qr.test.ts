import { describe, expect, it } from "vitest";
import { buildQrPayload, renderQrSvg, QR_PAYLOAD_PREFIX } from "./qr";

const STUDENT_ID = "9f2c1a84-4d3e-4c1b-8f77-2b6c9a0e51d3";

describe("buildQrPayload", () => {
  it("接頭辞と内部IDを繋げた文字列を返す", () => {
    expect(buildQrPayload(STUDENT_ID)).toBe(`hw1:${STUDENT_ID}`);
  });

  it("接頭辞は hw1: である", () => {
    expect(QR_PAYLOAD_PREFIX).toBe("hw1:");
  });

  it("出席番号を含まないので、番号を変えてもペイロードは変わらない", () => {
    // ペイロードは内部IDだけから決まる
    expect(buildQrPayload(STUDENT_ID)).toBe(buildQrPayload(STUDENT_ID));
    expect(buildQrPayload(STUDENT_ID)).not.toContain("番");
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
});
