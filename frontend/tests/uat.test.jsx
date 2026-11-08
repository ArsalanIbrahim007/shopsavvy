// The user acceptance test page (/try) and the user guide (/help).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({ submitUatResponse: vi.fn() }));
import { submitUatResponse } from "../src/api/endpoints.js";
import { ApiError } from "../src/api/errors.js";
import { emptyAnswers, missingAnswers, scoreMeaning, SUS_STATEMENTS, toUatResponse, UAT_TASKS } from "../src/lib/uat.js";
import TryShopSavvy from "../src/pages/TryShopSavvy.jsx";
import Help from "../src/pages/Help.jsx";

const answered = () => {
  const answers = emptyAnswers();
  for (const task of UAT_TASKS) answers.tasks[task.id] = { outcome: "done", ease: 6 };
  answers.sus = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
  return answers;
};

describe("lib/uat", () => {
  it("has the five tasks the backend expects, in its order, and the ten SUS statements, positive ones first", () => {
    expect(UAT_TASKS.map((t) => t.id)).toEqual(["cheapest", "discount", "wait", "drops", "alert"]);
    expect(SUS_STATEMENTS).toHaveLength(10);
    expect(SUS_STATEMENTS[0]).toMatch(/like to use ShopSavvy frequently/);
    expect(SUS_STATEMENTS[1]).toMatch(/unnecessarily complex/);
  });

  it("lists what is unanswered, pointing at the task or statement to go back to", () => {
    const answers = answered();
    expect(missingAnswers(answers)).toEqual([]);
    answers.tasks.wait.ease = null;
    answers.sus[3] = null;
    expect(missingAnswers(answers)).toEqual([
      { id: "task-wait", label: "Buy now or wait?: how easy it was" },
      { id: "sus-4", label: "Statement 4" },
    ]);
  });

  it("builds the request body, leaving out optional facts not given", () => {
    const answers = { ...answered(), role: "student", comment: "  ok  " };
    const body = toUatResponse(answers);
    expect(body.tasks[0]).toEqual({ id: "cheapest", outcome: "done", ease: 6 });
    expect(body).toMatchObject({ role: "student", comment: "ok", device: undefined, shopsOnline: undefined });
  });

  it("says where a score sits against the published average of 68", () => {
    expect(scoreMeaning(80)).toMatch(/^Above 68/);
    expect(scoreMeaning(68)).toMatch(/^Exactly 68/);
    expect(scoreMeaning(40)).toMatch(/^Below 68/);
  });
});

describe("the /try page", () => {
  beforeEach(() => {
    submitUatResponse.mockReset();
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  const page = () => render(<MemoryRouter><TryShopSavvy /></MemoryRouter>);

  function answerEverything() {
    for (const group of screen.getAllByRole("group", { name: "Did you manage it?" })) fireEvent.click(within(group).getByLabelText("I did it"));
    for (const group of screen.getAllByRole("group", { name: "How easy was it?" })) fireEvent.click(within(group).getByLabelText("6"));
    SUS_STATEMENTS.forEach((statement, i) => {
      const group = screen.getByRole("group", { name: statement });
      fireEvent.click(within(group).getByLabelText(i % 2 === 0 ? "Strongly agree" : "Strongly disagree"));
    });
  }

  it("shows the five tasks, each with a link to try it, and the ten statements", () => {
    page();
    expect(screen.getAllByRole("group", { name: "Did you manage it?" })).toHaveLength(5);
    expect(screen.getAllByRole("link", { name: "Open ShopSavvy in a new tab" })).toHaveLength(5);
    for (const statement of SUS_STATEMENTS) expect(screen.getByRole("group", { name: statement })).toBeInTheDocument();
  });

  it("says what is missing instead of sending an incomplete response", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(screen.getByRole("alert")).toHaveTextContent("20 answers are missing");
    expect(submitUatResponse).not.toHaveBeenCalled();
  });

  it("sends a complete response and thanks the person with their score", async () => {
    submitUatResponse.mockResolvedValue({ susScore: 100 });
    page();
    answerEverything();
    fireEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(await screen.findByRole("heading", { name: "Thank you" })).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    const [body] = submitUatResponse.mock.calls[0];
    expect(body.sus).toEqual([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]);
    expect(body.tasks).toHaveLength(5);
  });

  it("shows the server's error and keeps the answers when sending fails", async () => {
    submitUatResponse.mockRejectedValue(new ApiError({ status: 429, code: "RATE_LIMITED", message: "Thank you, we already have answers from this address." }));
    page();
    answerEverything();
    fireEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already have answers|try again/i);
    expect(screen.getByRole("button", { name: "Send my answers" })).toBeEnabled();
  });
});

describe("the user guide", () => {
  it("covers every part of the site, with the site's own labels", () => {
    render(<MemoryRouter><Help /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "How to use ShopSavvy" })).toBeInTheDocument();
    const contents = within(screen.getByRole("navigation", { name: "On this page" })).getAllByRole("link");
    expect(contents).toHaveLength(10);
    for (const link of contents) expect(document.getElementById(link.getAttribute("href").slice(1))).not.toBeNull();
    for (const label of ["Verified discount", "Likely genuine", "Unverified discount", "Suspicious discount", "Fake discount"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
