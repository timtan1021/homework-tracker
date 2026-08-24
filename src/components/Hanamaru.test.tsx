import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hanamaru } from "./Hanamaru";

describe("Hanamaru", () => {
  it("画像として読み上げられる", () => {
    render(<Hanamaru />);

    expect(screen.getByRole("img", { name: "提出しました" })).toBeInTheDocument();
  });

  it("SVGを描く", () => {
    const { container } = render(<Hanamaru />);

    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("朱色で描く", () => {
    const { container } = render(<Hanamaru />);
    const svg = container.querySelector("svg");

    // 朱はこのアプリで花丸と削除確認にしか使わない
    expect(svg?.getAttribute("stroke")).toBe("var(--color-shu)");
  });

  it("塗りつぶさない", () => {
    // ペンで描いた線であって図形ではない
    const { container } = render(<Hanamaru />);

    expect(container.querySelector("svg")?.getAttribute("fill")).toBe("none");
  });
});
