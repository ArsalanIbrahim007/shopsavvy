// A worker for testing WorkerPool: does whatever the job type says.
import { parentPort } from "node:worker_threads";

const JOBS = {
  echo: (payload) => payload,
  fail: () => { throw new Error("deliberate failure"); },
  crash: () => { process.exit(3); }, // ends the worker thread without answering
  sleep: ({ ms }) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* busy wait: like real CPU work */ }
    return "slept";
  },
  // Busy for ms and report when it started and ended, so a test can see whether two jobs overlapped without
  // depending on how fast or loaded the machine is.
  span: ({ ms }) => {
    const start = Date.now();
    while (Date.now() - start < ms) { /* busy wait */ }
    return { start, end: Date.now() };
  },
  pid: () => threadMarker,
};

const threadMarker = Math.random();

parentPort.on("message", ({ id, type, payload }) => {
  try {
    parentPort.postMessage({ id, ok: true, result: JOBS[type](payload) });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: error.message });
  }
});
