import { describe, expect, it } from "vitest";
import {
  generatePassphrase,
  normalizePassphrase,
  PASSPHRASE_WORDS,
} from "./passphrase";

describe("PASSPHRASE_WORDS", () => {
  // 語そのものは固定しない。入れ替えるたびに壊れるテストになる。
  // 守りたいのは語数と、紙から書き写せる性質のほう。
  it("64語ある", () => {
    expect(PASSPHRASE_WORDS).toHaveLength(64);
  });

  it("重複が無い", () => {
    expect(new Set(PASSPHRASE_WORDS).size).toBe(PASSPHRASE_WORDS.length);
  });

  it("ひらがなだけでできている", () => {
    for (const word of PASSPHRASE_WORDS) {
      expect(word).toMatch(/^[ぁ-ん]+$/);
    }
  });

  it("長音記号を含まない", () => {
    // 正規化がハイフンのつもりで打たれた「ー」を落とすため、
    // 語の側に「ー」があると合言葉が壊れる。
    for (const word of PASSPHRASE_WORDS) {
      expect(word).not.toContain("ー");
    }
  });
});

describe("generatePassphrase", () => {
  it("4語をハイフンで繋ぐ", () => {
    expect(generatePassphrase().split("-")).toHaveLength(4);
  });

  it("語はすべて単語リストから選ばれる", () => {
    for (const word of generatePassphrase().split("-")) {
      expect(PASSPHRASE_WORDS).toContain(word);
    }
  });

  it("呼ぶたびに変わる", () => {
    // 64^4 通りあるので、20回引いて全部同じなら生成が壊れている
    const seen = new Set(Array.from({ length: 20 }, generatePassphrase));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("normalizePassphrase", () => {
  it("ハイフンを落とす", () => {
    expect(normalizePassphrase("あめ-そら")).toBe("あめそら");
  });

  it("空白区切りでも同じ結果になる", () => {
    expect(normalizePassphrase("あめ そら")).toBe("あめそら");
  });

  it("全角空白でも同じ結果になる", () => {
    expect(normalizePassphrase("あめ　そら")).toBe("あめそら");
  });

  it("前後の空白を落とす", () => {
    expect(normalizePassphrase("  あめ-そら  ")).toBe("あめそら");
  });

  it("ハイフンのつもりで打たれた長音記号を落とす", () => {
    expect(normalizePassphrase("あめーそら")).toBe("あめそら");
  });

  it("全角ハイフンや各種ダッシュを落とす", () => {
    expect(normalizePassphrase("あめ−そら–ほし—つき")).toBe(
      "あめそらほしつき",
    );
  });
});
