// uatResponse.model.js — one person's answers to the user acceptance test (services/uat.service.js, frontend /try).
//
// Anonymous by design: no name, no email, no internet address. Only the task outcomes, the ten usability answers, three optional
// multiple-choice facts about the participant, and an optional comment.

import mongoose from "mongoose";

import { DEVICES, ROLES, SHOPS_ONLINE, TASK_OUTCOMES, UAT_TASKS } from "../services/uat.service.js";

const taskSchema = new mongoose.Schema(
  {
    id: { type: String, enum: UAT_TASKS, required: true },
    outcome: { type: String, enum: TASK_OUTCOMES, required: true },
    ease: { type: Number, min: 1, max: 7, required: true },
  },
  { _id: false },
);

const uatResponseSchema = new mongoose.Schema(
  {
    tasks: { type: [taskSchema], required: true },
    sus: { type: [Number], required: true },
    susScore: { type: Number, min: 0, max: 100, required: true },
    role: { type: String, enum: [...ROLES, null], default: null },
    shopsOnline: { type: String, enum: [...SHOPS_ONLINE, null], default: null },
    device: { type: String, enum: [...DEVICES, null], default: null },
    comment: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default mongoose.model("UatResponse", uatResponseSchema);
