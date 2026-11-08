// The user acceptance test (Gantt phase 5): the SUS score, the answers' checks, the summary, and the API through the real app with
// the model replaced by an in-memory list.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("../src/middleware/rateLimit.middleware.js", async (importOriginal) => {
  const passThrough = (req, res, next) => next();
  return { ...(await importOriginal()), uatSubmitLimiter: passThrough, dealsLimiter: passThrough };
});

import UatResponse from "../src/models/uatResponse.model.js";
import { createApp } from "../src/createApp.js";
import { describe as describeValues, summarizeUat, susScore, UAT_TASKS, validateUatResponse } from "../src/services/uat.service.js";

const tasks = (outcome = "done", ease = 6) => UAT_TASKS.map((id) => ({ id, outcome, ease }));
const valid = { tasks: tasks(), sus: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1], role: "student", device: "phone", comment: "  Easy to use.  " };

describe("susScore", () => {
  it("scores the ten answers 0-100: positive statements answer-1, negative 5-answer, times 2.5", () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2])).toBe(75);
  });

  it("refuses anything but ten whole answers from 1 to 5", () => {
    expect(susScore([5, 1, 5])).toBeNull();
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 6])).toBeNull();
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1.5])).toBeNull();
    expect(susScore(null)).toBeNull();
  });
});

describe("validateUatResponse", () => {
  it("keeps the tasks in the page's order, trims the comment, and stores the score", () => {
    const shuffled = { ...valid, tasks: [...valid.tasks].reverse() };
    const { ok, value } = validateUatResponse(shuffled);
    expect(ok).toBe(true);
    expect(value.tasks.map((t) => t.id)).toEqual(UAT_TASKS);
    expect(value).toMatchObject({ susScore: 100, role: "student", device: "phone", shopsOnline: null, comment: "Easy to use." });
  });

  it("names every problem: a missing task, an outcome or ease out of range, bad SUS answers, an unknown role", () => {
    const { ok, errors } = validateUatResponse({ tasks: [{ id: "cheapest", outcome: "maybe", ease: 9 }], sus: [1, 2], role: "teacher" });
    expect(ok).toBe(false);
    const paths = errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["tasks", "tasks.discount", "tasks.cheapest.outcome", "tasks.cheapest.ease", "sus", "role"]));
  });

  it("accepts nothing that identifies a person", () => {
    const { value } = validateUatResponse({ ...valid, name: "Ali", email: "ali@example.com" });
    expect(value).not.toHaveProperty("name");
    expect(value).not.toHaveProperty("email");
  });
});

describe("summarizeUat", () => {
  it("gives the SUS mean with a t-based 95% interval, and each task's completion and ease", () => {
    const responses = [
      { susScore: 80, tasks: tasks("done", 7), role: "student", createdAt: "2026-11-10T10:00:00Z" },
      { susScore: 70, tasks: tasks("with_help", 4), role: "working", createdAt: "2026-11-11T10:00:00Z" },
      { susScore: 60, tasks: tasks("not_done", 1), createdAt: "2026-11-12T10:00:00Z" },
    ];
    const s = summarizeUat(responses);
    expect(s.responses).toBe(3);
    expect(s.sus).toMatchObject({ mean: 70, median: 70, min: 60, max: 80, average: 68, aboveAverage: true });
    // sd 10, t(2) = 4.303: 70 +- 24.8
    expect(s.sus.ci95).toEqual([45.2, 94.8]);
    expect(s.tasks[0]).toMatchObject({ id: "cheapest", n: 3, done: 1, withHelp: 1, notDone: 1, completion: 33.3, meanEase: 4 });
    expect(s.participants.role).toEqual({ student: 1, working: 1, other: 0, not_said: 1 });
    expect(s).toMatchObject({ first: "2026-11-10T10:00:00.000Z", last: "2026-11-12T10:00:00.000Z" });
  });

  it("has nothing to say about no responses, and no interval for one", () => {
    expect(summarizeUat([]).sus).toMatchObject({ n: 0, mean: null, ci95: null, aboveAverage: null });
    expect(describeValues([72.5])).toMatchObject({ n: 1, mean: 72.5, ci95: null });
  });
});

describe("the /api/uat endpoints", () => {
  let server;
  let url;
  let stored;

  beforeAll(async () => {
    await new Promise((resolve) => {
      server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => {
    stored = [];
    vi.spyOn(UatResponse, "create").mockImplementation(async (doc) => { stored.push({ ...doc, createdAt: new Date() }); return doc; });
    vi.spyOn(UatResponse, "find").mockImplementation(() => ({ lean: async () => stored }));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const post = (body) => fetch(`${url}/api/uat/responses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (res) => ({ status: res.status, body: await res.json() }));

  it("stores a valid response, answers with its score, and counts it in the summary", async () => {
    const { status, body } = await post(valid);
    expect(status).toBe(201);
    expect(body).toEqual({ success: true, susScore: 100 });
    expect(stored).toHaveLength(1);

    const summary = await fetch(`${url}/api/uat/summary`).then((r) => r.json());
    expect(summary).toMatchObject({ success: true, responses: 1, sus: { mean: 100 } });
    expect(JSON.stringify(summary)).not.toContain("Easy to use"); // comments stay out of the public summary
  });

  it("refuses an incomplete response with the standard validation error, and stores nothing", async () => {
    const { status, body } = await post({ tasks: [], sus: [] });
    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(stored).toHaveLength(0);
  });
});
