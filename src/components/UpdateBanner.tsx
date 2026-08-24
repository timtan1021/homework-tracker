import { useAppUpdate } from "../pwa/useAppUpdate";

/** 新しい版が出たことを知らせる帯。押したときだけ切り替える。 */
export function UpdateBanner() {
  const update = useAppUpdate();

  if (!update.needsUpdate) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-kogan bg-gayoshi fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t px-4 py-3"
    >
      <span className="text-sm font-bold">新しい版があります</span>
      <button
        type="button"
        onClick={update.apply}
        className="bg-ai min-h-11 shrink-0 rounded px-4 py-2 font-bold text-gayoshi"
      >
        更新
      </button>
    </div>
  );
}
