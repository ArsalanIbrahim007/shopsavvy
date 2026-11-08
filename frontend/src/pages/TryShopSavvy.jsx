// TryShopSavvy.jsx — the user acceptance test (Gantt phase 5): five everyday tasks, each with whether the person managed it and how
// easy it was, then the System Usability Scale. Anonymous. The content and the answers' shape are in lib/uat.js; the backend scores
// and summarises them (backend/src/services/uat.service.js, scripts/ops/uat-summary.js).

import { useId, useState } from "react";
import { Link } from "react-router-dom";

import { submitUatResponse } from "../api/endpoints.js";
import { describeError } from "../api/errors.js";
import { usePageDescription, usePageTitle } from "../hooks/usePageTitle.js";
import {
  AGREEMENT, DEVICES, EASE_SCALE, emptyAnswers, missingAnswers, OUTCOMES, ROLES, scoreMeaning, SHOPS_ONLINE, SUS_AVERAGE,
  SUS_STATEMENTS, toUatResponse, UAT_TASKS,
} from "../lib/uat.js";
import "./HowItWorks.css";
import "./TryShopSavvy.css";

/** A row of radio buttons. `options` are [{value, label}]; `name` must be unique on the page. */
function Choice({ name, legend, options, value, onChange, scale = false, hint }) {
  return (
    <fieldset className={`uat-choice${scale ? " uat-choice--scale" : ""}`}>
      <legend>{legend}</legend>
      {hint && <p className="small muted uat-choice__hint">{hint}</p>}
      <div className="uat-choice__options">
        {options.map((option) => (
          <label key={option.value} className="uat-choice__option">
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function TryShopSavvy() {
  usePageTitle("Try ShopSavvy");
  usePageDescription("Help us test ShopSavvy: five short tasks and ten quick questions, about ten minutes. Anonymous.");
  const uid = useId();
  const [answers, setAnswers] = useState(emptyAnswers);
  const [missing, setMissing] = useState([]);
  const [state, setState] = useState({ status: "idle" });

  const setTask = (id, field, value) => setAnswers((a) => ({ ...a, tasks: { ...a.tasks, [id]: { ...a.tasks[id], [field]: value } } }));
  const setSus = (i, value) => setAnswers((a) => ({ ...a, sus: a.sus.map((v, j) => (j === i ? value : v)) }));
  const setField = (field, value) => setAnswers((a) => ({ ...a, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    const gaps = missingAnswers(answers);
    setMissing(gaps);
    if (gaps.length > 0) {
      document.getElementById(gaps[0].id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setState({ status: "sending" });
    try {
      const { susScore } = await submitUatResponse(toUatResponse(answers));
      setState({ status: "done", susScore });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setState({ status: "error", info: describeError(error) });
    }
  }

  if (state.status === "done") {
    return (
      <div className="container prose uat">
        <section className="card uat-thanks" role="status">
          <h1>Thank you</h1>
          <p className="lead">Your answers are saved. They help us see what works and what to fix.</p>
          <p className="uat-thanks__score"><span className="uat-thanks__value">{state.susScore}</span> / 100</p>
          <p className="muted">Your usability score for ShopSavvy. {scoreMeaning(state.susScore)}</p>
          <p><Link to="/" className="btn btn-accent">Back to ShopSavvy</Link></p>
        </section>
      </div>
    );
  }

  return (
    <div className="container prose uat">
      <div>
        <h1>Help us test ShopSavvy</h1>
        <p className="lead muted">
          Five short tasks and ten quick questions: about ten minutes. It is anonymous: we don't ask your name or email, and keep only
          your answers. <Link to="/privacy">Privacy</Link>
        </p>
      </div>

      <form className="uat-form" onSubmit={submit} noValidate>
        <section aria-labelledby={`${uid}-tasks`}>
          <h2 id={`${uid}-tasks`}>1. Five tasks</h2>
          <p className="muted">
            Keep this page open. For each task, open ShopSavvy in a new tab, try it, then come back and answer. There are no wrong
            answers: if something is hard, that is what we need to know.
          </p>
          <ol className="uat-tasks">
            {UAT_TASKS.map((task, i) => (
              <li key={task.id} id={`task-${task.id}`} className="card uat-task">
                <h3><span className="uat-task__n">{i + 1}</span> {task.title}</h3>
                <p>{task.ask}</p>
                <p><a href={task.start} target="_blank" rel="noopener">Open ShopSavvy in a new tab</a></p>
                <Choice name={`${uid}-${task.id}-outcome`} legend="Did you manage it?" options={OUTCOMES}
                  value={answers.tasks[task.id].outcome} onChange={(v) => setTask(task.id, "outcome", v)} />
                <Choice name={`${uid}-${task.id}-ease`} legend="How easy was it?" scale
                  hint="1 = very difficult, 7 = very easy"
                  options={EASE_SCALE.map((n) => ({ value: n, label: String(n) }))}
                  value={answers.tasks[task.id].ease} onChange={(v) => setTask(task.id, "ease", v)} />
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={`${uid}-sus`}>
          <h2 id={`${uid}-sus`}>2. Ten statements</h2>
          <p className="muted">How much do you agree with each? Answer quickly: your first reaction is the useful one.</p>
          <ol className="uat-sus">
            {SUS_STATEMENTS.map((statement, i) => (
              <li key={statement} id={`sus-${i + 1}`}>
                <Choice name={`${uid}-sus-${i}`} legend={statement} scale
                  options={AGREEMENT.map((label, j) => ({ value: j + 1, label }))}
                  value={answers.sus[i]} onChange={(v) => setSus(i, v)} />
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={`${uid}-about`}>
          <h2 id={`${uid}-about`}>3. About you <span className="muted small">(optional)</span></h2>
          <Choice name={`${uid}-role`} legend="You are" options={ROLES} value={answers.role} onChange={(v) => setField("role", v)} />
          <Choice name={`${uid}-shops`} legend="How often do you shop online?" options={SHOPS_ONLINE} value={answers.shopsOnline}
            onChange={(v) => setField("shopsOnline", v)} />
          <Choice name={`${uid}-device`} legend="You used ShopSavvy on a" options={DEVICES} value={answers.device}
            onChange={(v) => setField("device", v)} />
          <label htmlFor={`${uid}-comment`} className="uat-comment__label">Anything that confused you, or that you liked?</label>
          <textarea id={`${uid}-comment`} className="uat-comment" rows={4} maxLength={1000} value={answers.comment}
            onChange={(event) => setField("comment", event.target.value)} />
          <p className="small muted">Please don't write your name, phone number or email here.</p>
        </section>

        {missing.length > 0 && (
          <div className="uat-missing" role="alert">
            <p><strong>{missing.length === 1 ? "One answer is" : `${missing.length} answers are`} missing:</strong></p>
            <ul>
              {missing.slice(0, 6).map((gap) => <li key={gap.label}><a href={`#${gap.id}`}>{gap.label}</a></li>)}
              {missing.length > 6 && <li>and {missing.length - 6} more</li>}
            </ul>
          </div>
        )}
        {state.status === "error" && (
          <p className="uat-error" role="alert">{state.info.message}{state.info.reference ? ` (${state.info.reference})` : ""}</p>
        )}
        <p>
          <button type="submit" className="btn btn-accent" disabled={state.status === "sending"}>
            {state.status === "sending" ? "Sending..." : "Send my answers"}
          </button>
        </p>
        <p className="small muted">The average usability score across published studies is {SUS_AVERAGE} out of 100.</p>
      </form>
    </div>
  );
}
