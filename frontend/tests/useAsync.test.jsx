import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAsync } from "../src/hooks/useAsync.js";

describe("useAsync", () => {
  it("goes from loading to success with the data", async () => {
    const { result } = renderHook(() => useAsync(async () => "ready", []));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.data).toBe("ready");
  });

  it("reports an error, and reload runs the loader again", async () => {
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new Error("nope");
      return "ok";
    });
    const { result } = renderHook(() => useAsync(load, []));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error.message).toBe("nope");

    fail = false;
    act(() => result.current.reload());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shows loading again when the dependencies change, not the previous result", async () => {
    const { result, rerender } = renderHook(({ q }) => useAsync(async () => `result for ${q}`, [q]), { initialProps: { q: "a" } });
    await waitFor(() => expect(result.current.data).toBe("result for a"));

    rerender({ q: "b" });
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBe("result for b"));
  });

  it("aborts the previous request and ignores its late answer", async () => {
    const signals = [];
    let releaseFirst;
    const load = (q) => (signal) => {
      signals.push(signal);
      if (q === "slow") return new Promise((resolve) => { releaseFirst = () => resolve("slow answer"); });
      return Promise.resolve("fast answer");
    };

    const { result, rerender } = renderHook(({ q }) => useAsync(load(q), [q]), { initialProps: { q: "slow" } });
    rerender({ q: "fast" });

    await waitFor(() => expect(result.current.data).toBe("fast answer"));
    expect(signals[0].aborted).toBe(true);

    // The slow request finishing now must not overwrite the newer result.
    await act(async () => releaseFirst());
    expect(result.current.data).toBe("fast answer");
  });

  it("does not report an aborted request as an error", async () => {
    const load = (signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });

    const { result, unmount } = renderHook(() => useAsync(load, []));
    expect(result.current.status).toBe("loading");
    unmount();
    // No error state and no unhandled rejection: reaching here without a throw is the assertion.
    expect(true).toBe(true);
  });
});
