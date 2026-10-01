// workerPool.js — a small pool of long-lived worker threads for CPU-heavy jobs.
//
// Why it exists: grouping listings compares them pairwise, so its cost grows with
// the SQUARE of the number of listings (measured: 31 listings 33 ms, 195 listings
// 0.75 s, 539 listings 3.6 s, 1,005 listings 14 s). On the main thread that
// freezes every other request for that long. Here the work runs on another
// thread and the API keeps answering.
//
// Why a pool of persistent workers rather than a new worker per call: starting one
// means loading the modules and the trained model again, which costs more than
// a small job. Workers are started on first use and reused.
//
// Two lanes. A shopper is waiting on an "interactive" job (a search, a product page), and nobody is waiting on a
// "background" one (warming the deals and catalog caches, the scheduled-scrape query list). Background jobs may
// never use the last worker, so one is always free for a shopper, and waiting interactive jobs go before waiting
// background ones. (Before this, a cold start filled both workers with cache warm-ups and a product page waited
// 6 to 15 seconds behind them.) A job that has started cannot be interrupted, so the reserve is what guarantees
// the wait: at most one background job runs at a time with two workers.
//
// Behaviour worth knowing:
//  - At most `size` jobs run at once (at most `backgroundLimit` of them background); others wait in a queue.
//  - Each lane's queue is bounded (`maxQueue`). Past that, run() rejects immediately with a
//    503 SERVICE_BUSY AppError, so a flood of heavy searches cannot pile up forever.
//  - A job that takes longer than its timeout has its worker terminated and the
//    job rejected; the worker is replaced on demand. A worker that crashes rejects
//    the job it was running and is replaced the same way.
//  - Workers do not keep the process alive when idle (unref), but do while a job
//    is running, so a script awaiting a job is not cut off.

import { Worker } from "node:worker_threads";

import { AppError, ERROR_CODES } from "../errors/AppError.js";

let nextJobId = 1;

export class WorkerPool {
  /**
   * @param {URL|string} script  the worker entry file
   * @param {object} [options]
   * @param {number} [options.size]       workers running at once
   * @param {number} [options.timeoutMs]  default per-job time limit
   * @param {number} [options.maxQueue]   jobs per lane allowed to wait before run() rejects
   * @param {number} [options.backgroundLimit]  most background jobs running at once (default: all but one worker)
   * @param {string} [options.name]       for error messages
   */
  constructor(script, { size = 2, timeoutMs = 120000, maxQueue = 20, name = "worker", backgroundLimit } = {}) {
    this.script = script;
    this.timeoutMs = timeoutMs;
    this.maxQueue = maxQueue;
    this.name = name;
    // With a single worker there is nothing to reserve: background work may use it.
    this.backgroundLimit = backgroundLimit ?? (size > 1 ? size - 1 : size);
    this.slots = Array.from({ length: size }, () => ({ worker: null, job: null }));
    this.queue = [];
    this.closed = false;
  }

  /**
   * Runs `type` with `payload` on a worker. Resolves with the worker's result.
   * @param {object} [options]
   * @param {number} [options.timeoutMs]
   * @param {"interactive"|"background"} [options.priority]  "interactive" (default) when a shopper is waiting
   */
  run(type, payload, { timeoutMs = this.timeoutMs, priority = "interactive" } = {}) {
    if (this.closed) return Promise.reject(new Error(`${this.name} pool is closed`));
    if (priority !== "interactive" && priority !== "background") return Promise.reject(new Error(`unknown priority "${priority}"`));

    return new Promise((resolve, reject) => {
      const job = { id: nextJobId++, type, payload, timeoutMs, priority, resolve, reject, timer: null };

      const slot = this.slots.find((s) => !s.job);
      if (slot && this.#mayStart(job)) {
        this.#start(slot, job);
        return;
      }

      if (this.queue.filter((queued) => queued.priority === priority).length >= this.maxQueue) {
        reject(new AppError(503, "The server is busy right now. Please try again in a moment.", { code: ERROR_CODES.SERVICE_BUSY }));
        return;
      }
      this.queue.push(job);
    });
  }

  /** Starts the workers now, so the first real job does not pay for it. */
  warm() {
    for (const slot of this.slots) if (!slot.worker) this.#spawn(slot);
  }

  /** Jobs running (and how many of them background), jobs waiting, workers alive. */
  stats() {
    return {
      running: this.slots.filter((s) => s.job).length,
      runningBackground: this.#runningBackground(),
      queued: this.queue.length,
      workers: this.slots.filter((s) => s.worker).length,
    };
  }

  async close() {
    this.closed = true;
    for (const job of this.queue.splice(0)) job.reject(new Error(`${this.name} pool is closed`));
    await Promise.all(
      this.slots.map(async (slot) => {
        if (slot.job) this.#fail(slot, new Error(`${this.name} pool is closed`));
        if (slot.worker) await slot.worker.terminate();
        slot.worker = null;
      })
    );
  }

  // ---------------------------------------------------------------- internals

  #spawn(slot) {
    const worker = new Worker(this.script);
    worker.unref();

    worker.on("message", (message) => {
      const job = slot.job;
      if (!job || message.id !== job.id) return; // a late answer from a job already timed out
      this.#finish(slot);
      message.ok ? job.resolve(message.result) : job.reject(new Error(message.error));
    });

    const crashed = (error) => {
      if (slot.worker !== worker) return; // already replaced
      slot.worker = null;
      if (slot.job) this.#fail(slot, new Error(`${this.name} crashed: ${error?.message || "exited unexpectedly"}`));
      this.#next();
    };
    worker.on("error", crashed);
    worker.on("exit", (code) => code !== 0 && crashed(new Error(`exit code ${code}`)));

    slot.worker = worker;
    return worker;
  }

  #start(slot, job) {
    const worker = slot.worker || this.#spawn(slot);
    slot.job = job;
    worker.ref();

    job.timer = setTimeout(() => {
      // Too slow: throw the worker away (its result would be too late anyway) and start fresh next time.
      const stuck = slot.worker;
      slot.worker = null;
      this.#fail(slot, new Error(`${this.name} job "${job.type}" timed out after ${job.timeoutMs} ms`));
      stuck?.terminate();
      this.#next();
    }, job.timeoutMs);

    try {
      worker.postMessage({ id: job.id, type: job.type, payload: job.payload });
    } catch (error) {
      // Data that cannot be copied to a worker (a function, a class instance with hidden state).
      this.#fail(slot, error);
      this.#next();
    }
  }

  #finish(slot) {
    clearTimeout(slot.job.timer);
    slot.job = null;
    slot.worker?.unref();
    this.#next();
  }

  #fail(slot, error) {
    const job = slot.job;
    if (!job) return;
    clearTimeout(job.timer);
    slot.job = null;
    job.reject(error);
  }

  #runningBackground() {
    return this.slots.filter((s) => s.job?.priority === "background").length;
  }

  /** A background job may start only while fewer than backgroundLimit are running; an interactive one always may. */
  #mayStart(job) {
    return job.priority === "interactive" || this.#runningBackground() < this.backgroundLimit;
  }

  /** The next waiting job that may start now: interactive ones first (in order), then background ones. */
  #takeNext() {
    const interactive = this.queue.findIndex((job) => job.priority === "interactive");
    if (interactive >= 0) return this.queue.splice(interactive, 1)[0];
    const background = this.queue.findIndex((job) => this.#mayStart(job));
    return background >= 0 ? this.queue.splice(background, 1)[0] : null;
  }

  #next() {
    if (this.closed) return;
    while (this.queue.length > 0) {
      const slot = this.slots.find((s) => !s.job);
      if (!slot) return;
      const job = this.#takeNext();
      if (!job) return;
      this.#start(slot, job);
    }
  }
}
