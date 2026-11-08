// uat.js — the user acceptance test on the /try page (pages/TryShopSavvy.jsx): the five tasks, the ten System Usability Scale
// statements, and the answers turned into what the API stores (backend/src/services/uat.service.js, whose task ids these match).

/** Each task: what the person is asked to do, and where on the site they might start. */
export const UAT_TASKS = Object.freeze([
  {
    id: "cheapest",
    title: "Find the cheapest store",
    ask: "Pick a phone you might buy (for example a Samsung Galaxy A17) and find which store sells it cheapest right now.",
    start: "/",
  },
  {
    id: "discount",
    title: "Check a discount",
    ask: "Find a product with a crossed-out \"was\" price. According to ShopSavvy, is that discount real?",
    start: "/",
  },
  {
    id: "wait",
    title: "Buy now or wait?",
    ask: "On any product's page, decide whether you would buy it now or wait, using what ShopSavvy shows you.",
    start: "/",
  },
  {
    id: "drops",
    title: "A recent price drop",
    ask: "Find an air conditioner whose price has just come down, and say by how much.",
    start: "/drops",
  },
  {
    id: "alert",
    title: "A price alert",
    ask: "Find where you would ask to be emailed when a product's price falls. You don't have to give your email.",
    start: "/",
  },
]);

export const OUTCOMES = Object.freeze([
  { value: "done", label: "I did it" },
  { value: "with_help", label: "I did it with help" },
  { value: "not_done", label: "I couldn't do it" },
]);

/** The Single Ease Question's scale: 1 very difficult to 7 very easy. */
export const EASE_SCALE = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

// The System Usability Scale (Brooke, 1996), with "the system" read as ShopSavvy, and "cumbersome" glossed as "awkward" for readers
// whose first language is not English (Finstad, 2006). Odd statements are positive, even ones negative: keep their order.
export const SUS_STATEMENTS = Object.freeze([
  "I think that I would like to use ShopSavvy frequently.",
  "I found ShopSavvy unnecessarily complex.",
  "I thought ShopSavvy was easy to use.",
  "I think that I would need the support of a technical person to be able to use ShopSavvy.",
  "I found the various functions in ShopSavvy were well integrated.",
  "I thought there was too much inconsistency in ShopSavvy.",
  "I would imagine that most people would learn to use ShopSavvy very quickly.",
  "I found ShopSavvy very cumbersome (awkward) to use.",
  "I felt very confident using ShopSavvy.",
  "I needed to learn a lot of things before I could get going with ShopSavvy.",
]);

export const AGREEMENT = Object.freeze(["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]);

export const ROLES = Object.freeze([
  { value: "student", label: "Student" },
  { value: "working", label: "Working" },
  { value: "other", label: "Other" },
]);
export const SHOPS_ONLINE = Object.freeze([
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month or so" },
  { value: "rarely", label: "Rarely" },
]);
export const DEVICES = Object.freeze([
  { value: "phone", label: "Phone" },
  { value: "computer", label: "Computer" },
]);

/** The average SUS score across published studies (Sauro, 2011). */
export const SUS_AVERAGE = 68;

/** An empty set of answers, as the page starts. */
export function emptyAnswers() {
  return {
    tasks: Object.fromEntries(UAT_TASKS.map((task) => [task.id, { outcome: null, ease: null }])),
    sus: Array(SUS_STATEMENTS.length).fill(null),
    role: "",
    shopsOnline: "",
    device: "",
    comment: "",
  };
}

/** What is still unanswered, in the page's order: [{id, label}] (the id of the element to move to). */
export function missingAnswers(answers) {
  const missing = [];
  for (const task of UAT_TASKS) {
    const given = answers.tasks[task.id];
    if (!given?.outcome) missing.push({ id: `task-${task.id}`, label: `${task.title}: whether you managed it` });
    if (!given?.ease) missing.push({ id: `task-${task.id}`, label: `${task.title}: how easy it was` });
  }
  answers.sus.forEach((answer, i) => {
    if (!answer) missing.push({ id: `sus-${i + 1}`, label: `Statement ${i + 1}` });
  });
  return missing;
}

/** The body for POST /api/uat/responses. Optional facts left blank are not sent. */
export function toUatResponse(answers) {
  const optional = (value) => (value ? value : undefined);
  return {
    tasks: UAT_TASKS.map((task) => ({ id: task.id, outcome: answers.tasks[task.id].outcome, ease: answers.tasks[task.id].ease })),
    sus: [...answers.sus],
    role: optional(answers.role),
    shopsOnline: optional(answers.shopsOnline),
    device: optional(answers.device),
    comment: answers.comment.trim() || undefined,
  };
}

/** The words under a person's own score on the thank-you screen. */
export function scoreMeaning(score) {
  if (!(score >= 0)) return "";
  if (score > SUS_AVERAGE) return `Above ${SUS_AVERAGE}, the average score across published usability studies.`;
  if (score === SUS_AVERAGE) return `Exactly ${SUS_AVERAGE}, the average across published usability studies.`;
  return `Below ${SUS_AVERAGE}, the average across published usability studies: your answers show us what to improve.`;
}
