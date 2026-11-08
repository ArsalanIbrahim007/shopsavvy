# Fair price for these specs (linear regression)

Generated 2026-11-08T16:14:01.168Z by `src/scripts/ml/fairPrice/01-train-evaluate.js`.

**Model:** ridge linear regression on the log of the price, one per category (`src/ml/ridge.js`, hand-written, conjugate gradient).
**Features** (`src/ml/fairPrice/features.js`): the title's words and neighbouring word pairs, storage and RAM (log2), screen size,
tonnage, drum kg, litres, inverter, the store, the condition and the PTA status.

**Test:** products the model never saw. A product is the first four words of its title plus its storage; a fifth of the products are
held out with every store's listing of them. The penalty λ was chosen on a product split inside the training data. Errors are
|predicted − real| / real.

| Category | Listings | Held out | Median error | Within 15% | R² (log price) | Baseline: brand + storage median | Baseline: category median | λ |
|---|---|---|---|---|---|---|---|---|
| smartphone | 5909 | 1017 | **12.9%** | 55.0% | 0.759 | 42.6% | 61.9% | 3 |
| laptop | 1618 | 342 | **15.0%** | 50.0% | 0.913 | 27.1% | 67.5% | 3 |
| tv | 5613 | 1054 | **9.1%** | 68.3% | 0.921 | 51.3% | 56.3% | 10 |
| tablet | 866 | 263 | **23.3%** | 31.9% | 0.729 | 34.0% | 61.2% | 10 |
| smartwatch | 1933 | 348 | **28.5%** | 25.6% | 0.766 | 33.5% | 84.3% | 1 |
| headphones | 3391 | 665 | **32.9%** | 23.8% | 0.586 | 30.7% | 53.0% | 3 |
| air_conditioner | 7731 | 1673 | **7.8%** | 77.9% | 0.769 | 21.8% | 19.4% | 10 |
| refrigerator | 5713 | 1303 | **9.1%** | 70.1% | 0.682 | 19.9% | 20.4% | 10 |
| washing_machine | 4910 | 1062 | **13.6%** | 54.1% | 0.822 | 30.6% | 50.9% | 30 |
| monitor | 404 | 74 | **18.3%** | 39.2% | 0.739 | 48.0% | 49.1% | 3 |

**How it is used:** the fair price for a listing's specs is the model's prediction; a listing priced below it by more than the
model's usual error is a good price for what it is, even when no other store sells the same product. A claimed "was" price far above
the fair price is evidence against a discount, even without price history.
