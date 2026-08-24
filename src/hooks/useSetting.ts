import { useCallback, useEffect, useState } from "react";
import {
  getSetting,
  setSetting,
  SETTING_DEFAULTS,
  type SettingKey,
} from "../db/settings";

export function useSetting(key: SettingKey): {
  value: boolean;
  loading: boolean;
  /** 保存に失敗したときの日本語メッセージ。成功していれば null。 */
  error: string | null;
  update: (next: boolean) => Promise<void>;
} {
  const [value, setValue] = useState<boolean>(SETTING_DEFAULTS[key]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getSetting(key)
      .then((stored) => {
        if (!cancelled) {
          setValue(stored);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback(
    async (next: boolean) => {
      // 先に表示を切り替え、書き込みが失敗したら元に戻す。
      // 黙って戻すと「保存されない設定」に見えるため、理由も伝える。
      const previous = value;
      setValue(next);
      setError(null);

      try {
        await setSetting(key, next);
      } catch {
        setValue(previous);
        setError("設定を保存できませんでした。もう一度切り替えてください");
      }
    },
    [key, value],
  );

  return { value, loading, error, update };
}
