import { useState } from "react";
import { BASE_URL } from "../api/api";

/**
 * "Tell me when this drops to X". Accountless: an email and a target price,
 * matching POST /api/alerts. The alert starts pending: the address's owner has to
 * follow the link in the confirmation email before it becomes active (double
 * opt-in), and it is marked triggered when a scheduled scrape sees the price reach
 * the target.
 */
function PriceAlertForm({ listing }) {
  const suggested = Math.floor((listing.price * 0.95) / 100) * 100;
  const [email, setEmail] = useState("");
  const [targetPrice, setTargetPrice] = useState(String(suggested));
  const [state, setState] = useState({ status: "idle", message: "" });

  async function submit(e) {
    e.preventDefault();
    setState({ status: "sending", message: "" });

    try {
      const response = await fetch(`${BASE_URL}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing._id,
          email: email.trim(),
          targetPrice: Number(targetPrice),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        setState({
          status: "done",
          // The server says whether a confirmation email is needed and whether it could be sent.
          message: data.confirmationRequired
            ? data.message
            : `Alert saved. It will fire when the price reaches PKR ${Number(targetPrice).toLocaleString()} or lower.`,
        });
      } else {
        const detail = data.errors?.map((e) => e.msg).join(". ");
        setState({ status: "error", message: detail || data.message || "Could not save the alert." });
      }
    } catch {
      setState({ status: "error", message: "Could not reach the server. Try again shortly." });
    }
  }

  if (state.status === "done") {
    return <div className="alert-form-success">{state.message}</div>;
  }

  return (
    <form className="alert-form" onSubmit={submit}>
      <label>
        Email
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Alert me at or below (PKR)
        <input
          type="number"
          required
          min="1"
          value={targetPrice}
          onChange={(e) => setTargetPrice(e.target.value)}
        />
      </label>
      <button type="submit" disabled={state.status === "sending"}>
        {state.status === "sending" ? "Saving..." : "Set price alert"}
      </button>
      {state.status === "error" && <div className="alert-form-error">{state.message}</div>}
    </form>
  );
}

export default PriceAlertForm;
