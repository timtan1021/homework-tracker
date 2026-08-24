/**
 * 先生が良い提出につける花丸。
 *
 * 朱はこのアプリで花丸と削除確認にしか使わない。ダイアログの朱が
 * 「取り返しのつかない操作」なら、こちらは本来の朱ペンである。
 * トーストも「✓」も出さない。丸がつく、それだけにする。
 */
export function Hanamaru({
  className = "size-24",
}: {
  /** 置く場所に合わせて大きさを変える。既定は結果表示用の大きさ。 */
  className?: string;
} = {}) {
  return (
    <svg
      role="img"
      aria-label="提出しました"
      viewBox="0 0 100 100"
      stroke="var(--color-shu)"
      fill="none"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`hanamaru ${className}`}
    >
      {/* 外側の丸。速く描く。 */}
      <circle className="hanamaru-circle" cx="50" cy="50" r="36" />
      {/* 内側の花弁4枚。ゆっくり描く。1枚を定義して90度ずつ回している。 */}
      <path className="hanamaru-petals" d="M50.0 45.0 C58.0 41.0 54.0 28.0 50.0 28.0 C46.0 28.0 42.0 41.0 50.0 45.0 Z M55.0 50.0 C59.0 58.0 72.0 54.0 72.0 50.0 C72.0 46.0 59.0 42.0 55.0 50.0 Z M50.0 55.0 C42.0 59.0 46.0 72.0 50.0 72.0 C54.0 72.0 58.0 59.0 50.0 55.0 Z M45.0 50.0 C41.0 42.0 28.0 46.0 28.0 50.0 C28.0 54.0 41.0 58.0 45.0 50.0 Z" />
    </svg>
  );
}
