/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// トークンは index.css の @theme にしか無い。誰かが消したら Tailwind は
// 黙って空のクラスを生成するため、ここで存在を検査する。
const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

describe("配色トークン", () => {
  it("山吹(面)と淡い山吹(地)が定義されている", () => {
    expect(css).toMatch(/--color-yamabuki:\s*#e39b12;/);
    expect(css).toMatch(/--color-yamabuki-usu:\s*#fbeccb;/);
  });
});
