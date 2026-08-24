import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraUnavailableReason } from "./useQrCamera";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cameraUnavailableReason", () => {
  it("getUserMedia があれば null を返す", () => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
    });

    expect(cameraUnavailableReason()).toBeNull();
  });

  it("mediaDevices が無ければ理由を返す", () => {
    // HTTPで開いた場合。getUserMedia はセキュアコンテキスト限定で、
    // ポリフィルも回避策も存在しない。
    vi.stubGlobal("navigator", {});

    expect(cameraUnavailableReason()).toBe(
      "この開き方ではカメラを使えません。番号でチェックしてください",
    );
  });

  it("getUserMedia が無ければ理由を返す", () => {
    vi.stubGlobal("navigator", { mediaDevices: {} });

    expect(cameraUnavailableReason()).toBe(
      "この開き方ではカメラを使えません。番号でチェックしてください",
    );
  });
});
