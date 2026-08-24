import { describe, expect, it } from "vitest";
import { manifest } from "./manifest";

describe("manifest", () => {
  it("ホーム画面から専用アプリとして開く", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("起動先はホーム", () => {
    // catch-all が /scan へ送るので、/ で開けば提出チェックに着く
    expect(manifest.start_url).toBe("/");
  });

  it("日本語のアプリとして宣言する", () => {
    expect(manifest.lang).toBe("ja");
  });

  it("配色トークンの色を使う", () => {
    // 画用紙と藍。ここだけ別の色を使うとホーム画面で浮く
    expect(manifest.background_color).toBe("#FBFAF7");
    expect(manifest.theme_color).toBe("#22406B");
  });

  it("必要なサイズのアイコンが揃っている", () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("maskable のアイコンがある", () => {
    // 端末が丸や角丸に切り抜くため、専用の余白付きが要る
    const maskable = manifest.icons.filter(
      (icon) => "purpose" in icon && icon.purpose === "maskable",
    );
    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe("512x512");
  });

  it("short_name はホーム画面に収まる長さにする", () => {
    // 端末によっては12文字程度で切られる
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });
});
