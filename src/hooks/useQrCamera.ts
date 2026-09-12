import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

export type CameraState =
  | "idle"
  | "starting"
  | "running"
  | "unavailable"
  | "denied";

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
  /** カメラの起動をタップに直結させる。iOS Safariのホーム画面起動(standalone)
   * モードは許可がセッションをまたいで保持されず、かつタップに紐づかない
   * 自動呼び出しは失敗しやすいため、起動は必ずこの呼び出しから行う。 */
  start: () => void;
} {
  const [state, setState] = useState<CameraState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // onScan は毎レンダー新しい関数になるのでrefで持つ
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  const lastRef = useRef<{ payload: string; at: number } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  const cancelledRef = useRef(false);
  const stateRef = useRef<CameraState>(state);
  stateRef.current = state;

  function stop(): void {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  // enabled になった直後は「使えない理由が無いか」だけ調べる。
  // getUserMedia の呼び出し自体は start() からのみ行う。
  useEffect(() => {
    cancelledRef.current = false;

    if (!enabled) {
      stop();
      setState("idle");
      setMessage(null);
      return;
    }

    const reason = cameraUnavailableReason();
    setState(reason !== null ? "unavailable" : "idle");
    setMessage(reason);

    return () => {
      cancelledRef.current = true;
      stop();
    };
  }, [enabled]);

  function tick(): void {
    if (cancelledRef.current) {
      return;
    }
    frameRef.current = requestAnimationFrame(tick);

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

  function start(): void {
    if (stateRef.current !== "idle") {
      return;
    }
    setState("starting");

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((granted) => {
        if (cancelledRef.current) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = granted;

        const video = videoRef.current;
        if (video !== null) {
          video.srcObject = granted;
          void video.play();
        }

        setState("running");
        setMessage(null);
        frameRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (cancelledRef.current) {
          return;
        }
        setState("denied");
        setMessage(
          "カメラを使えません。端末の設定で許可するか、番号でチェックしてください",
        );
      });
  }

  return { state, message, videoRef, canvasRef, start };
}
