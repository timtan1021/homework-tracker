/**
 * 先生が良い提出につける花丸。
 *
 * 朱はこのアプリで花丸と削除確認にしか使わない。ダイアログの朱が
 * 「取り返しのつかない操作」なら、こちらは本来の朱ペンである。
 * トーストも「✓」も出さない。丸がつく、それだけにする。
 */
export function Hanamaru() {
  return (
    <svg
      role="img"
      aria-label="提出しました"
      viewBox="0 0 100 100"
      stroke="var(--color-shu)"
      fill="none"
      strokeWidth={5}
      strokeLinecap="round"
      className="hanamaru size-24"
    >
      {/* 外側の丸。速く描く。 */}
      <circle className="hanamaru-circle" cx="50" cy="50" r="34" />
      {/* 内側の花弁。ゆっくり描く。 */}
      <path
        className="hanamaru-petals"
        d="M50 28 C60 38 62 50 50 58 C38 50 40 38 50 28 Z
           M72 50 C62 60 50 62 42 50 C50 38 62 40 72 50 Z"
      />
    </svg>
  );
}
