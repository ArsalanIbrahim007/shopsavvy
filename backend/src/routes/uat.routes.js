import express from "express";

import { submitUatResponse, getUatSummary } from "../controllers/uat.controller.js";
import { dealsLimiter, uatSubmitLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/uat/responses:
 *   post:
 *     summary: Send one person's answers to the user acceptance test (the /try page)
 *     description: >
 *       Five tasks, each with its outcome (done, with_help, not_done) and its ease from 1 (very difficult) to 7 (very easy), then
 *       the ten System Usability Scale answers from 1 to 5. Anonymous: no name or email is accepted. Answers with the score
 *       (0-100). Rate limited to 5 per hour per IP.
 *     tags:
 *       - User acceptance test
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tasks, sus]
 *             properties:
 *               tasks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: string, enum: [cheapest, discount, wait, drops, alert] }
 *                     outcome: { type: string, enum: [done, with_help, not_done] }
 *                     ease: { type: integer, minimum: 1, maximum: 7 }
 *               sus:
 *                 type: array
 *                 items: { type: integer, minimum: 1, maximum: 5 }
 *                 minItems: 10
 *                 maxItems: 10
 *               role: { type: string, enum: [student, working, other] }
 *               shopsOnline: { type: string, enum: [weekly, monthly, rarely] }
 *               device: { type: string, enum: [phone, computer] }
 *               comment: { type: string, maxLength: 1000 }
 *     responses:
 *       201:
 *         description: Stored. The body holds the response's SUS score.
 *       400:
 *         description: A task, an answer or an optional field is missing or out of range.
 *       429:
 *         description: Rate limit exceeded (5 / hour / IP).
 */
router.post("/responses", uatSubmitLimiter, submitUatResponse);

/**
 * @swagger
 * /api/uat/summary:
 *   get:
 *     summary: The test's results so far
 *     description: Number of responses, the SUS score (mean, median, range, 95% interval, against the published average of 68), each task's completion rate and mean ease, and who took part. No single response is returned.
 *     tags:
 *       - User acceptance test
 *     responses:
 *       200:
 *         description: The summary.
 */
router.get("/summary", dealsLimiter, getUatSummary);

export default router;
