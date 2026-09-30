// indexes.js — builds the database indexes and says so clearly if one cannot be
// built.
//
// Mongoose builds indexes in the background at start-up. A UNIQUE index cannot
// be built over data that already breaks the rule (for example two listings
// with the same platform and sourceUrl), and by default that failure is easy to
// miss: the app keeps running without the protection. This makes it loud and
// tells the person what to do.

import mongoose from "mongoose";

const DUPLICATE_HINT =
  "The collection already holds duplicates. Review them with " +
  "`node src/scripts/merge-duplicate-listings.js` (a dry run that writes nothing); " +
  "`--apply` merges them. Then restart.";

/**
 * Waits for every model's indexes to finish building. Never throws: a failed
 * index is logged and returned, so start-up is not blocked by it.
 *
 * @param {Array} [models] defaults to every model registered with mongoose
 * @returns {Promise<Array<{model: string, error: string}>>} failures
 */
export async function ensureIndexes(models = Object.values(mongoose.models)) {
  const failures = [];

  await Promise.all(
    models.map(async (model) => {
      try {
        await model.init();
      } catch (error) {
        failures.push({ model: model.modelName, error: error.message });
        const hint = error.code === 11000 || /duplicate key|E11000/i.test(error.message) ? ` ${DUPLICATE_HINT}` : "";
        console.error(`[db] Could not build an index for ${model.modelName}: ${error.message}.${hint}`);
      }
    })
  );

  return failures;
}
