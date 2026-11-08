// uat.service.js — user acceptance testing (the Gantt chart's phase 5): people try ShopSavvy on five everyday tasks, then rate it on
// the System Usability Scale. Pure functions: the answers' shape, the SUS score and the summary, so all of it is tested without a
// database. The page is frontend/src/pages/TryShopSavvy.jsx; the results are written by scripts/ops/uat-summary.js.
//
// The System Usability Scale (Brooke, 1996) is ten statements answered from 1 (strongly disagree) to 5 (strongly agree), alternately
// positive and negative. Its score runs from 0 to 100; across hundreds of studies the average is about 68 (Sauro, 2011), which is
// the usual line between "below" and "above average" usability. Each task also gets the Single Ease Question (Sauro & Dumas, 2009):
// "Overall, how easy or difficult was this task?" from 1 (very difficult) to 7 (very easy).

/** The tasks, in the order the page asks them. The page holds the words a participant reads; these ids must match it. */
export const UAT_TASKS = Object.freeze(["cheapest", "discount", "wait", "drops", "alert"]);
export const TASK_OUTCOMES = Object.freeze(["done", "with_help", "not_done"]);
export const SUS_ITEMS = 10;
export const EASE_MAX = 7;
export const ROLES = Object.freeze(["student", "working", "other"]);
export const SHOPS_ONLINE = Object.freeze(["weekly", "monthly", "rarely"]);
export const DEVICES = Object.freeze(["phone", "computer"]);
export const MAX_COMMENT = 1000;
/** The average SUS score across published studies (Sauro, 2011): the line between below and above average usability. */
export const SUS_AVERAGE = 68;

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

/**
 * The SUS score, 0-100, from the ten answers (each 1-5). Odd statements are positive: answer - 1. Even ones are negative: 5 - answer.
 * The sum (0-40) times 2.5.
 */
export function susScore(answers) {
  if (!Array.isArray(answers) || answers.length !== SUS_ITEMS || !answers.every((a) => isInt(a, 1, 5))) return null;
  const sum = answers.reduce((total, answer, i) => total + (i % 2 === 0 ? answer - 1 : 5 - answer), 0);
  return sum * 2.5;
}

/**
 * Checks a response as the page sends it and returns what is stored: {ok: true, value} or {ok: false, errors: [{path, msg}]}.
 * Nothing that identifies a person is accepted: no name, no email. The comment is free text, trimmed and cut to MAX_COMMENT.
 */
export function validateUatResponse(body) {
  const errors = [];
  const fail = (path, msg) => errors.push({ path, msg });
  const input = body && typeof body === "object" ? body : {};

  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  if (tasks.length !== UAT_TASKS.length) fail("tasks", `tasks must answer each of the ${UAT_TASKS.length} tasks`);
  const byId = new Map(tasks.map((task) => [task?.id, task]));
  const cleanTasks = UAT_TASKS.map((id) => {
    const task = byId.get(id);
    if (!task) {
      fail(`tasks.${id}`, `task ${id} is missing`);
      return null;
    }
    if (!TASK_OUTCOMES.includes(task.outcome)) fail(`tasks.${id}.outcome`, `outcome must be one of ${TASK_OUTCOMES.join(", ")}`);
    if (!isInt(task.ease, 1, EASE_MAX)) fail(`tasks.${id}.ease`, `ease must be a whole number from 1 to ${EASE_MAX}`);
    return { id, outcome: task.outcome, ease: task.ease };
  });

  const sus = input.sus;
  const score = susScore(sus);
  if (score === null) fail("sus", `sus must be ${SUS_ITEMS} answers, each a whole number from 1 to 5`);

  const optional = (name, allowed) => {
    const value = input[name];
    if (value === undefined || value === null || value === "") return null;
    if (!allowed.includes(value)) fail(name, `${name} must be one of ${allowed.join(", ")}`);
    return value;
  };
  const role = optional("role", ROLES);
  const shopsOnline = optional("shopsOnline", SHOPS_ONLINE);
  const device = optional("device", DEVICES);

  let comment = input.comment ?? "";
  if (typeof comment !== "string") fail("comment", "comment must be text");
  comment = typeof comment === "string" ? comment.trim().slice(0, MAX_COMMENT) : "";

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { tasks: cleanTasks, sus: [...sus], susScore: score, role, shopsOnline, device, comment } };
}

const round = (value, places = 1) => (value === null ? null : Number(value.toFixed(places)));

// Two-sided 95% critical values of Student's t, by degrees of freedom; 1.96 beyond the table. Usability studies are small (5 to 20
// people), where 1.96 would make the interval too narrow.
const T95 = [null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
const t95 = (df) => T95[df] ?? 1.96;

/** Mean, median, range and a 95% interval for the mean (t-based; null for fewer than two). */
export function describe(values) {
  const n = values.length;
  if (n === 0) return { n, mean: null, median: null, min: null, max: null, ci95: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  let ci95 = null;
  if (n >= 2) {
    const sd = Math.sqrt(values.reduce((total, v) => total + (v - mean) ** 2, 0) / (n - 1));
    const half = (t95(n - 1) * sd) / Math.sqrt(n);
    ci95 = [round(Math.max(0, mean - half)), round(Math.min(100, mean + half))];
  }
  return { n, mean: round(mean), median: round(median), min: sorted[0], max: sorted.at(-1), ci95 };
}

/** The summary of stored responses: SUS, each task's completion and ease, and who took part. No single response is shown. */
export function summarizeUat(responses = []) {
  const sus = describe(responses.map((r) => r.susScore).filter((s) => typeof s === "number"));
  const tasks = UAT_TASKS.map((id) => {
    const answers = responses.map((r) => r.tasks?.find((t) => t.id === id)).filter(Boolean);
    const count = (outcome) => answers.filter((a) => a.outcome === outcome).length;
    const eases = answers.map((a) => a.ease);
    return {
      id,
      n: answers.length,
      done: count("done"),
      withHelp: count("with_help"),
      notDone: count("not_done"),
      completion: answers.length ? round((100 * count("done")) / answers.length) : null,
      meanEase: eases.length ? round(eases.reduce((a, b) => a + b, 0) / eases.length) : null,
    };
  });
  const tally = (key, allowed) => Object.fromEntries([...allowed, "not_said"].map((v) => [v, responses.filter((r) => (r[key] ?? "not_said") === v).length]));
  const times = responses.map((r) => new Date(r.createdAt).getTime()).filter(Number.isFinite);
  return {
    responses: responses.length,
    sus: { ...sus, average: SUS_AVERAGE, aboveAverage: sus.mean === null ? null : sus.mean > SUS_AVERAGE },
    tasks,
    participants: { role: tally("role", ROLES), shopsOnline: tally("shopsOnline", SHOPS_ONLINE), device: tally("device", DEVICES) },
    first: times.length ? new Date(Math.min(...times)).toISOString() : null,
    last: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}
