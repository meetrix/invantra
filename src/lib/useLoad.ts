import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./api";

/**
 * Runs a loader on mount and whenever `deps` change. `data` is undefined until
 * the first load finishes; `reload` runs it again, keeping the old data on screen.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    return loader()
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((err) => setError(errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, reload, setData };
}
