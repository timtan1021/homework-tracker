import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

/**
 * 非同期の読み込みを1つの形にまとめる。
 *
 * `key` が変わったとき、または `reload()` が呼ばれたときに読み直す。
 * 依存配列ではなく文字列キーを取るのは、配列を展開すると依存配列の長さが
 * 可変になりフックの規則を破るため。
 */
export function useAsync<T>(
  load: () => Promise<T>,
  key: string,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setNonce((current) => current + 1);
  }, []);

  // load は毎レンダー新しい関数になるので、最新の実装をrefで持つ。
  // これで load を依存に入れずに済み、無限ループを避けられる。
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    loadRef
      .current()
      .then((data) => {
        if (!cancelled) {
          setState({ status: "ready", data });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "データを読み込めませんでした。画面を開き直してください",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  return { ...state, reload };
}
