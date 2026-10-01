// HonestPrices.jsx — "How we keep prices honest": what ShopSavvy's own checks found in the data it holds right now, how the two
// trained models scored on pairs they never saw, and what is still weak. The numbers come from GET /api/integrity (counted by the
// server from its cached catalog, and read from the evaluation reports the team's scripts write), never typed in here. If the
// numbers cannot be loaded the page says so and the explanations still read, instead of showing figures that might be stale.

import { Link } from "react-router-dom";

import { getIntegrity } from "../api/endpoints.js";
import ErrorState from "../components/ErrorState.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { formatDate, formatNumber, formatPrice, timeAgo } from "../lib/format.js";
import { discountRows, formatScore, formatShare, markupRows, matcherRows, outlookJudgeable, outlookRows, perHundred, ptaRows, share } from "../lib/integrity.js";
import { platformName } from "../lib/platforms.js";
import "./HowItWorks.css"; // the shared reading column (.prose)
import "./HonestPrices.css";

function Figure({ value, label, children }) {
  return (
    <div className="honest-figure">
      <p className="honest-figure__value">{value}</p>
      <p className="honest-figure__label">{label}</p>
      {children}
    </div>
  );
}

function CountTable({ caption, rows, total }) {
  return (
    <table className="honest-table">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr><th scope="col">Result</th><th scope="col" className="num">Offers</th><th scope="col" className="num">Share</th></tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row">
              {row.label}
              <span className="honest-table__hint small muted">{row.hint}</span>
            </th>
            <td className="num">{formatNumber(row.count)}</td>
            <td className="num">{formatShare(row.share)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr><th scope="row">All</th><td className="num">{formatNumber(total)}</td><td className="num">100%</td></tr>
      </tfoot>
    </table>
  );
}

function LiveNumbers({ live, generatedAt }) {
  const { discounts, pta, freshness, history, unusualPrices } = live;

  return (
    <>
      <p className="muted">
        Counted from {formatNumber(live.offers)} offers for {formatNumber(live.products)} products at {live.stores} stores
        (last counted {timeAgo(generatedAt)}).
      </p>

      <div className="honest-grid">
        <section className="card honest-card" aria-labelledby="unusual-heading">
          <h3 id="unusual-heading">Prices that look like mistakes</h3>
          <Figure value={formatNumber(unusualPrices.count)} label={unusualPrices.count === 1 ? "offer set aside right now" : "offers set aside right now"} />
          <p className="muted">
            A price far out of line with what other stores charge for the same product is probably a listing error (a missing digit, a
            different variant). It stays visible and labelled, and it is never counted as the lowest price, the best deal or a saving.
          </p>
          {unusualPrices.examples.length > 0 && (
            <ul className="honest-examples">
              {unusualPrices.examples.map((example) => (
                <li key={`${example.platform}-${example.title}`}>
                  <strong>{example.title}</strong>, {platformName(example.platform)}, {formatPrice(example.price)}.
                  <span className="small muted"> {example.reason}</span>
                </li>
              ))}
            </ul>
          )}
          {unusualPrices.count === 0 && <p className="muted">None right now. We do not invent examples.</p>}
        </section>

        <section className="card honest-card" aria-labelledby="discount-heading">
          <h3 id="discount-heading">Discount claims, checked</h3>
          <Figure value={formatNumber(discounts.claims)} label="offers claim a discount (a crossed-out 'was' price)" />
          <CountTable caption="Discount claims by result" rows={discountRows(discounts)} total={discounts.claims} />
          <p className="muted">
            {formatShare(share(discounts.verdicts.unverified, discounts.claims))} of claims are unverified, and that is deliberate: a claim can only be checked against a product's own price history, and ours
            has records from {formatNumber(history.days)} different {history.days === 1 ? "day" : "days"}{history.since ? ` since ${formatDate(history.since)}` : ""} ({formatNumber(history.points)} price points).
            We say "unverified" rather than guess. We never count a claimed discount as a saving.
          </p>
          <p className="muted">
            {formatNumber(discounts.aboveMarket)} claims put the "was" price above anything other stores charge for the product, and are marked "above market".
          </p>
        </section>

        <section className="card honest-card" aria-labelledby="pta-heading">
          <h3 id="pta-heading">PTA-approved or not</h3>
          <Figure value={formatNumber(pta.offers)} label="phone and tablet offers" />
          <CountTable caption="PTA status of phone and tablet offers" rows={ptaRows(pta)} total={pta.offers} />
          <p className="muted">
            A phone without PTA approval cannot use local networks without a tax payment, and sells far cheaper, so it must never be
            compared with approved ones. {formatNumber(pta.productsKeptApart)} products are kept apart for this reason. For{" "}
            {formatNumber(pta.readFromProductPage)} offers whose title said nothing, we read the store's own product page for the answer.
          </p>
        </section>

        <section className="card honest-card" aria-labelledby="fresh-heading">
          <h3 id="fresh-heading">How fresh the prices are</h3>
          <Figure value={formatShare(share(freshness.within24h, live.offers))} label="of offers were checked in the last 24 hours" />
          <p className="muted">
            {formatShare(share(freshness.within72h, live.offers))} in the last 3 days.
            {freshness.newestAt ? ` The newest check was ${timeAgo(freshness.newestAt)}.` : ""} Every offer shows when it was last updated.
          </p>
        </section>
      </div>
    </>
  );
}

function LiveSection({ report }) {
  if (report.status === "loading") {
    return (
      <div aria-busy="true" className="honest-loading">
        <Skeleton height={20} width="50%" />
        <Skeleton height={220} />
        <p className="small muted">Counting the numbers. The first time after a restart this can take about a minute.</p>
      </div>
    );
  }
  if (report.status === "error") return <ErrorState error={report.error} onRetry={report.reload} />;
  if (!report.data.live) return <p className="muted">The live numbers are not available right now.</p>;
  return <LiveNumbers live={report.data.live} generatedAt={report.data.generatedAt} />;
}

function MatcherSection({ report }) {
  const matcher = report.status === "success" ? report.data.evaluation.matcher : null;
  if (report.status === "loading") return <Skeleton height={140} />;
  if (!matcher) return <p className="muted">The accuracy numbers could not be loaded right now.</p>;

  const rows = matcherRows(matcher.models);
  const production = matcher.models.production;
  return (
    <>
      <div className="honest-scroll" role="region" aria-label="Matching accuracy table" tabIndex={0}>
      <table className="honest-table honest-table--wide">
        <caption className="visually-hidden">How each way of matching did on {matcher.heldOutPairs} labelled pairs it had never seen</caption>
        <thead>
          <tr>
            <th scope="col">Way of matching</th>
            <th scope="col" className="num">Right overall</th>
            <th scope="col" className="num">Right when it says "same"</th>
            <th scope="col" className="num">Finds the real matches</th>
            <th scope="col" className="num">F1</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.inUse ? "is-in-use" : undefined}>
              <th scope="row">{row.label}</th>
              <td className="num">{formatScore(row.accuracy)}</td>
              <td className="num">{formatScore(row.precision)}</td>
              <td className="num">{formatScore(row.recall)}</td>
              <td className="num">{formatScore(row.f1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="small muted">
        {matcher.heldOutPairs} pairs of listings, labelled by hand against a written rubric, and never used for training. Report generated {formatDate(matcher.generatedAt)}.
      </p>
      <p>
        In plain words: when the model we use says two listings are the same product, it is right {perHundred(production.precision)} times, and it
        finds {perHundred(production.recall)} of the real matches. It misses many, and that is the safer way to be wrong: a missed match
        shows one product twice, a wrong match compares two different products. The hard rules (storage, RAM, screen, PTA status, 4G and 5G,
        Pro and Pro+, model codes) run first and cannot be overruled by the model.
      </p>
      <p className="muted">
        The model was trained on {matcher.trainingPairs} labelled pairs. A newer one trained on more finds more matches but also makes more wrong
        ones, so we have not switched to it: we check what its merges do to the real catalogue by hand first. These pairs include many that are
        deliberately hard (near-identical titles that name different models), so they are not what a shopper sees on an ordinary search, but they are few: one pair
        moves a score by about a point. We show this as it is.
      </p>
    </>
  );
}

function DiscountModelSection({ report }) {
  const discount = report.status === "success" ? report.data.evaluation.discount : null;
  if (report.status === "loading") return <Skeleton height={140} />;
  if (!discount) return <p className="muted">The detector's numbers could not be loaded right now.</p>;

  return (
    <>
      <p>
        Checking a "was" price against the product's own price history works only once the product has history: it could judge{" "}
        {formatNumber(discount.historyRuleJudged)} of {formatNumber(discount.judgeableClaims)} claims ({discount.historyRuleShare}%) when this was
        measured. So a second check, a trained model, compares each claim with what the other stores charge today, and flags the ones that are
        out of line. It flagged {formatScore(discount.flaggedRealClaims)} of real claims.
      </p>
      <table className="honest-table">
        <caption className="visually-hidden">Share of invented mark-ups the detector caught, by size of mark-up</caption>
        <thead>
          <tr><th scope="col">A "was" price invented at</th><th scope="col" className="num">Caught</th></tr>
        </thead>
        <tbody>
          {markupRows(discount.caughtInvented).map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label} the real price</th>
              <td className="num">{formatScore(row.caught)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Read it plainly: blatant mark-ups (twice the real price) are caught almost every time, moderate ones mostly are not. A moderate
        mark-up is common across stores, so it cannot be told from ordinary pricing, and we do not pretend to. What we do instead is call such claims
        "unverified" and never count them as savings. Averaged over {discount.splits} different train and test splits of {formatNumber(discount.judgeableClaims)} claims; the
        test uses made-up mark-ups because there are no confirmed real fakes to test against. Measured {formatDate(discount.generatedAt)}.
      </p>
    </>
  );
}

function OutlookSection({ report }) {
  if (report.status === "loading") return <Skeleton height={140} />;
  const outlook = report.status === "success" ? report.data.evaluation.outlook : null;
  if (!outlook) return <p className="muted">The test results could not be loaded right now.</p>;

  const rows = outlookRows(outlook);
  return (
    <>
      <p>
        The "Wait or buy?" panel on a product page is not a price forecast. It says where today's price sits among the prices we have
        recorded: the lowest so far, well above its usual level, or about usual. To test it, we replay it on past records: for each one with a
        later record about a week on, we work out what the panel would have said then, using only the history before that day, and check
        whether the price then fell or rose by 3% or more.
      </p>
      <div className="honest-scroll" role="region" aria-label="Wait or buy test table" tabIndex={0}>
        <table className="honest-table honest-table--wide">
          <caption className="visually-hidden">What the wait-or-buy panel would have said, and what the price did a week later</caption>
          <thead>
            <tr>
              <th scope="col">What it would have said</th>
              <th scope="col" className="num">Comparisons</th>
              <th scope="col" className="num">Fell 3% or more</th>
              <th scope="col" className="num">Rose 3% or more</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.verdict}>
                <th scope="row">
                  {row.label}
                  {!row.judgeable && row.comparisons > 0 && <span className="honest-table__hint small muted">too few to judge</span>}
                </th>
                <td className="num">{formatNumber(row.comparisons)}</td>
                <td className="num">{formatScore(row.fellShare)}</td>
                <td className="num">{formatScore(row.roseShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        {formatNumber(outlook.comparisons)} comparisons{outlook.from && outlook.to ? `, from ${formatDate(outlook.from)} to ${formatDate(outlook.to)}` : ""}. Comparisons
        of one product on neighbouring days overlap, so they are fewer independent facts than the count suggests. Report generated {formatDate(outlook.generatedAt)}.
      </p>
      {outlookJudgeable(outlook) ? (
        <p>
          Read it by comparing "5% or more above its usual price" with the rows around it: if it did not fall more often, the verdict carries no
          information and should not be trusted. A row needs {formatNumber(outlook.minimumToJudge)} comparisons before it counts.
        </p>
      ) : (
        <p>
          None of the verdicts has the {formatNumber(outlook.minimumToJudge)} comparisons it needs to be judged yet, so we cannot say whether any of
          them foreshadows a price move. That is why the panel calls its verdicts an early estimate, and says "too early" for most products. Daily
          records are recent, so we re-run this test as they build up.
        </p>
      )}
    </>
  );
}

export default function HonestPrices() {
  // One request feeds all three sections.
  const report = useAsync((signal) => getIntegrity({ signal }), []);
  return (
    <div className="container prose honest">
      <h1>How we keep prices honest</h1>
      <p className="lead muted">
        A price comparison is only worth using if the prices and the savings are right. This page shows what ShopSavvy checks, how well each
        check works, and where it is still weak, with numbers counted from the data we hold right now.
      </p>

      <section aria-labelledby="live-heading">
        <h2 id="live-heading">What the checks found today</h2>
        <LiveSection report={report} />
      </section>

      <section aria-labelledby="matching-heading">
        <h2 id="matching-heading">Do we put the right listings together?</h2>
        <p className="muted">
          Stores name one product many ways, and a 128 GB phone is not a 256 GB phone. Matching comes first, because a wrong match makes every
          price comparison after it wrong.
        </p>
        <MatcherSection report={report} />
      </section>

      <section aria-labelledby="was-heading">
        <h2 id="was-heading">Is a "was" price real?</h2>
        <DiscountModelSection report={report} />
      </section>

      <section aria-labelledby="outlook-heading">
        <h2 id="outlook-heading">Does "wait or buy?" work?</h2>
        <OutlookSection report={report} />
      </section>

      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading">What we cannot tell you</h2>
        <ul>
          <li>Prices are as of the last time we looked, and stores change them. Every offer shows its age.</li>
          <li>We compare the price on the store's page. Delivery, warranty terms and in-store prices are not included.</li>
          <li>Some stores do not state PTA approval or a colour; we say "not stated" rather than guess, and we show where the answer came from.</li>
          <li>A new product has no price history, so its discount stays unverified until it has some.</li>
          <li>"Wait or buy?" is an early estimate, not a forecast: it cannot know about a sale, a new model or a price rise.</li>
          <li>We can still be wrong. A match that looks wrong is one click from the store's own page, where you can check.</li>
          <li>ShopSavvy is free to use. We do not take money from stores to rank or recommend them.</li>
        </ul>
      </section>

      <p className="small">
        <Link to="/how-it-works">How a price is checked, step by step</Link> · <Link to="/">Back to the home page</Link>
      </p>
    </div>
  );
}
