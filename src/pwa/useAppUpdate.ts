import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * 新しい版が用意できたかを返す。
 *
 * 自動で適用しない。先生がスキャンしている最中に画面が切り替わると、
 * いま読んだカードが記録できたのか分からなくなる。
 */
export function useAppUpdate(): {
  needsUpdate: boolean;
  apply: () => void;
} {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  return {
    needsUpdate: needRefresh,
    apply: () => void updateServiceWorker(true),
  };
}
