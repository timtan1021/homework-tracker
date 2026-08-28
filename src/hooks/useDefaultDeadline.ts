import { useCallback, useEffect, useState } from "react";
import { getDefaultDeadline, setDefaultDeadline } from "../db/settings";

const FALLBACK = "08:15";

export function useDefaultDeadline(): {
  value: string;
  loading: boolean;
  error: string | null;
  update: (next: string) => Promise<void>;
} {
  const [value, setValue] = useState<string>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getDefaultDeadline()
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
  }, []);

  const update = useCallback(
    async (next: string) => {
      const previous = value;
      setValue(next);
      setError(null);

      try {
        await setDefaultDeadline(next);
      } catch {
        setValue(previous);
        setError("設定を保存できませんでした。もう一度お試しください");
      }
    },
    [value],
  );

  return { value, loading, error, update };
}
