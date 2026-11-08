// uat.controller.js — the user acceptance test's answers in, its summary out (services/uat.service.js).

import UatResponse from "../models/uatResponse.model.js";
import { AppError } from "../errors/AppError.js";
import { summarizeUat, validateUatResponse } from "../services/uat.service.js";

export async function submitUatResponse(req, res) {
  const checked = validateUatResponse(req.body);
  if (!checked.ok) throw AppError.validation(checked.errors);
  await UatResponse.create(checked.value);
  // The participant sees their own score on the thank-you screen; nothing else about the response comes back.
  res.status(201).json({ success: true, susScore: checked.value.susScore });
}

export async function getUatSummary(req, res) {
  const responses = await UatResponse.find({}, { tasks: 1, susScore: 1, role: 1, shopsOnline: 1, device: 1, createdAt: 1 }).lean();
  res.json({ success: true, ...summarizeUat(responses) });
}
