import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateServiceWorker = vi.fn();
let needRefresh = false;

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}));

const { UpdateBanner } = await import("./UpdateBanner");

beforeEach(() => {
  needRefresh = false;
  updateServiceWorker.mockClear();
});

describe("更新の帯", () => {
  it("新しい版が無ければ何も出さない", () => {
    needRefresh = false;
    const { container } = render(<UpdateBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("新しい版があれば知らせる", () => {
    needRefresh = true;
    render(<UpdateBanner />);

    expect(screen.getByText("新しい版があります")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更新" })).toBeInTheDocument();
  });

  it("押したときだけ切り替える", async () => {
    const user = userEvent.setup();
    needRefresh = true;
    render(<UpdateBanner />);

    // 出しただけでは切り替えない。スキャン中に画面が変わると
    // 記録できたのか分からなくなる。
    expect(updateServiceWorker).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "更新" }));

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
