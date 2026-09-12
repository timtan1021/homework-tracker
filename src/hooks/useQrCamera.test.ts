import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraUnavailableReason, useQrCamera } from "./useQrCamera";

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

describe("useQrCamera", () => {
  it("使える環境では、start()を呼ぶまでidleのまま待つ", () => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
    });

    const { result } = renderHook(() =>
      useQrCamera({ enabled: true, onScan: vi.fn() }),
    );

    expect(result.current.state).toBe("idle");
  });

  it("使えない環境では、start()を呼ばなくてもunavailableになる", () => {
    vi.stubGlobal("navigator", {});

    const { result } = renderHook(() =>
      useQrCamera({ enabled: true, onScan: vi.fn() }),
    );

    expect(result.current.state).toBe("unavailable");
  });

  it("start()を呼ぶとgetUserMediaが実行されrunningになる", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const { result } = renderHook(() =>
      useQrCamera({ enabled: true, onScan: vi.fn() }),
    );

    act(() => {
      result.current.start();
    });
    expect(result.current.state).toBe("starting");

    await waitFor(() => {
      expect(result.current.state).toBe("running");
    });
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "environment" },
    });
  });

  it("start()でgetUserMediaが失敗すればdeniedになる", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const { result } = renderHook(() =>
      useQrCamera({ enabled: true, onScan: vi.fn() }),
    );

    act(() => {
      result.current.start();
    });

    await waitFor(() => {
      expect(result.current.state).toBe("denied");
    });
    expect(result.current.message).toBe(
      "カメラを使えません。端末の設定で許可するか、番号でチェックしてください",
    );
  });
});
