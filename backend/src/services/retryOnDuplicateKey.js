/**
 * Runs a database write and, if it fails because another request inserted the
 * same unique key an instant earlier (MongoDB error 11000), runs it once more.
 *
 * An upsert is "find it, else insert it", and two of them racing for the same
 * new product can both decide to insert. With a unique index one of them is
 * rejected. Running it again finds the document the winner created and updates
 * it, which is the answer the caller wanted in the first place.
 */
export async function retryOnDuplicateKey(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error?.code === 11000) return operation();
    throw error;
  }
}
