// AlertForm.jsx — "tell me when this drops to X". Accountless: an email and a target price. Because nothing proves
// the person typing an address owns it, the alert starts inactive and a confirmation link is emailed (double
// opt-in). The server says whether that email could be sent, and this shows its words rather than claiming
// the alert is live. Problems are shown next to the field they belong to.

import { useId, useState } from "react";

import { createAlert } from "../../api/endpoints.js";
import { describeError } from "../../api/errors.js";
import { formatPrice } from "../../lib/format.js";
import { suggestedTarget, validateAlert } from "../../lib/alertForm.js";
import "./product.css";

export default function AlertForm({ listing }) {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState(String(suggestedTarget(listing.price)));
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ status: "idle" });

  async function submit(event) {
    event.preventDefault();
    const found = validateAlert({ email, target }, listing.price);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setState({ status: "sending" });
    try {
      const result = await createAlert({ listingId: listing._id, email: email.trim(), targetPrice: Number(target) });
      setState({ status: "done", result });
    } catch (error) {
      const info = describeError(error);
      // Field errors from the server ("email must be a valid email address") go next to their field.
      const fields = {};
      for (const detail of error.details ?? []) {
        if (detail.path === "email") fields.email = detail.msg;
        if (detail.path === "targetPrice") fields.target = detail.msg;
      }
      setErrors(fields);
      setState({ status: "error", info });
    }
  }

  if (state.status === "done") {
    const { result } = state;
    return (
      <div className="alert-form alert-form--done card" role="status">
        <h3>{result.confirmationRequired ? "One more step" : "Alert set"}</h3>
        <p>{result.message}</p>
        <p className="small muted">We'll alert you at {formatPrice(Number(target))} or lower. You can cancel from any email we send.</p>
        <button type="button" className="btn btn-ghost" onClick={() => setState({ status: "idle" })}>Set another alert</button>
      </div>
    );
  }

  return (
    <form className="alert-form card" onSubmit={submit} noValidate>
      <label htmlFor={`${uid}-email`}>Your email</label>
      <input id={`${uid}-email`} type="email" autoComplete="email" placeholder="you@example.com" value={email}
        aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${uid}-email-err` : undefined}
        onChange={(event) => { setEmail(event.target.value); setErrors((e) => ({ ...e, email: undefined })); }} />
      {errors.email && <p className="alert-form__error" id={`${uid}-email-err`}>{errors.email}</p>}

      <label htmlFor={`${uid}-target`}>Alert me at or below (PKR)</label>
      <input id={`${uid}-target`} type="number" inputMode="numeric" min="1" value={target}
        aria-invalid={Boolean(errors.target)} aria-describedby={errors.target ? `${uid}-target-err` : undefined}
        onChange={(event) => { setTarget(event.target.value); setErrors((e) => ({ ...e, target: undefined })); }} />
      {errors.target && <p className="alert-form__error" id={`${uid}-target-err`}>{errors.target}</p>}

      {state.status === "error" && (
        <p className="alert-form__error" role="alert">
          {state.info.message}{state.info.reference ? ` (${state.info.reference})` : ""}
        </p>
      )}

      <button type="submit" className="btn btn-accent" disabled={state.status === "sending"}>
        {state.status === "sending" ? "Setting the alert..." : "Notify me when the price drops"}
      </button>
      <p className="small muted">We email you once to confirm, and only when the price reaches your target. Never spam.</p>
    </form>
  );
}
