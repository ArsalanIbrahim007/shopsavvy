// ShareButton.jsx — shares the product's link: the phone's share sheet where there is one, else copies it. The link is the API's
// share page, whose preview card shows this product (lib/share.js).

import { useState } from "react";

import { shareAddress } from "../../lib/share.js";

export default function ShareButton({ id, title, name }) {
  const [status, setStatus] = useState("");
  const url = shareAddress(id, title);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return; // the shopper closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied");
    } catch {
      setStatus(`Copy this link: ${url}`);
    }
  }

  return (
    <p className="small share">
      <button type="button" className="btn btn-ghost" onClick={share}>Share</button>{" "}
      <span role="status">{status}</span>
    </p>
  );
}
