// useAsync.js — runs an async loader and reports loading / error / success, so no
// page has to hand-roll useState + useEffect + cancellation.
//
//   const search = useAsync((signal) => searchListings({ q, signal }), [q]);
//   search.status   "loading" | "success" | "error"
//   search.data     the result when status is "success"
//   search.error    an ApiError when status is "error"
//   search.reload() run it again
//
// - A request the page no longer wants (deps changed, component left) is aborted
//   and its result ignored, so a slow earlier search can never overwrite a newer one.
// - "loading" is derived, not stored: a result belongs to the dependency key it
//   was produced for, and any other key means "still loading". That removes the
//   need to set state synchronously inside the effect.
// - deps must be primitives (strings, numbers, booleans): they are compared by
//   their JSON form.

import { useEffect, useRef, useState } from "react";

export function useAsync(load, deps = []) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null });

  const requestKey = `${JSON.stringify(deps)}#${attempt}`;

  // Always call the latest loader without making it a dependency of the effect.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();

    loadRef
      .current(controller.signal)
      .then(
        (data) => {
          // A request that was superseded or abandoned must not write its answer, or a
          // slow earlier search could overwrite the newer one.
          if (controller.signal.aborted) return;
          setResult({ key: requestKey, status: "success", data });
        },
        (error) => {
          if (controller.signal.aborted || error?.name === "AbortError") return;
          setResult({ key: requestKey, status: "error", error });
        }
      );

    return () => controller.abort();
  }, [requestKey]);

  const current = result.key === requestKey ? result : { status: "loading" };

  return {
    status: current.status,
    data: current.data,
    error: current.error,
    reload: () => setAttempt((n) => n + 1),
  };
}
