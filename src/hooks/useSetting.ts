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
  update: (next: boolean) => Promise<void>;
} {
  const [value, setValue] = useState<boolean>(SETTING_DEFAULTS[key]);
  const [loading, setLoading] = useState(true);

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
      setValue(next);
      await setSetting(key, next);
    },
    [key],
  );

  return { value, loading, update };
}
