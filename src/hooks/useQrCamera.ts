import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

export type CameraState = "starting" | "running" | "unavailable" | "denied";

/** カメラが使えない理由。使えるなら null。 */
export function cameraUnavailableReason(): string | null {
  const media = navigator.mediaDevices;
  if (media === undefined || typeof media.getUserMedia !== "function") {
    // getUserMedia はセキュアコンテキスト限定。http://192.168.x.x では
    // ポリフィルも回避策も無い。
    return "この開き方ではカメラを使えません。番号でチェックしてください";
  }
  return null;
}

/** 同じカードを読み続けないための間隔。 */
const REPEAT_GUARD_MS = 2000;

export function useQrCamera({
  enabled,
  onScan,
}: {
  enabled: boolean;
  onScan: (payload: string) => void;
}): {
  state: CameraState;
  message: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
} {
  const [state, setState] = useState<CameraState>("starting");
  const [message, setMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // onScan は毎レンダー新しい関数になるのでrefで持つ
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  const lastRef = useRef<{ payload: string; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const reason = cameraUnavailableReason();
    if (reason !== null) {
      setState("unavailable");
      setMessage(reason);
      return;
    }

    let stream: MediaStream | null = null;
    let frame = 0;
    let cancelled = false;

    function tick(): void {
      if (cancelled) {
        return;
      }
      frame = requestAnimationFrame(tick);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video === null || canvas === null || video.readyState !== 4) {
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) {
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height);
      if (found === null) {
        return;
      }

      // カメラは毎フレーム同じカードを認識する。抑えないと結果表示が
      // 点滅し続け、先生が読めたかどうか分からなくなる。
      const now = Date.now();
      const last = lastRef.current;
      if (
        last !== null &&
        last.payload === found.data &&
        now - last.at < REPEAT_GUARD_MS
      ) {
        return;
      }
      lastRef.current = { payload: found.data, at: now };

      onScanRef.current(found.data);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((granted) => {
        if (cancelled) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = granted;

        const video = videoRef.current;
        if (video !== null) {
          video.srcObject = granted;
          void video.play();
        }

        setState("running");
        setMessage(null);
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setState("denied");
        setMessage(
          "カメラを使えません。端末の設定で許可するか、番号でチェックしてください",
        );
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);

  return { state, message, videoRef, canvasRef };
}
