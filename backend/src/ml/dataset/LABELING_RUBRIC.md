# Labeling rubric

A pair is labelled **1 (same product)** when a shopper comparing the two listings would be
comparing the same thing they would receive: same brand, model line, model number or
generation, and the same specification tier that the titles state. Otherwise **0**.

Applied in this order:

1. **Different product line or generation → 0.** Galaxy Watch 7 vs 8, Buds 3 vs Buds 3 Pro,
   Tab S10 FE vs S10 FE+, ThinkPad E14 vs IdeaPad Slim 5, Fold 5 vs Fold 7.
2. **A decisive specification differs when both titles state it → 0.** Screen or case size,
   CPU model or tier, GPU, RAM, storage, connectivity (Bluetooth vs LTE), panel type
   (LED vs QLED vs OLED), resolution (HD vs FHD vs 4K).
3. **Bundle, accessory or condition differs → 0.** A device vs a case for it, "with keyboard"
   vs without, new vs used or refurbished, a set of two vs one.
4. **Differences that do not change the product are ignored → still 1.** Colour, store
   wording ("Dual Sim With Official Warranty", "1 year brand warranty", "Mercantile
   Warranty"), punctuation and word order, a regional SKU suffix on the same model code,
   the brand's own marketing name for the same model.
5. **A specification stated on only one side.** Label 1 only if everything else agrees, the
   less specific title is plausibly a shorter listing of the same unit, **and** the prices
   are within about 15% of each other. A large price gap with an unstated specification
   suggests a different variant, so label 0. When a title is so bare that it could match
   several variants (for example just a model name that exists in two sizes) and the price
   does not settle it, label 0: the system should not merge on a guess.
6. **Labelled from the titles and prices alone**, without looking at what the rule system or
   the trained model says about the pair. Model output is looked at only after all labels
   are fixed.

Each label carries a one-line rationale naming which rule decided it. A random sample of 20
labelled pairs is then checked independently by a person; corrections override the label.
