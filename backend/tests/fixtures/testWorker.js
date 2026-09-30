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
