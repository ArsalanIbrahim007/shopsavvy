export function normalizeTitle(title = "") {
  return title
    .toLowerCase()

    // Remove common brand words
    .replace(/\bapple\b/g, "")

    // Remove marketing terms
    .replace(/\bpta approved\b/g, "")
    .replace(/\bofficial warranty\b/g, "")
    .replace(/\bbrand new\b/g, "")
    .replace(/\bnew\b/g, "")

    // Normalize storage
    .replace(/\b128 gb\b/g, "128gb")
    .replace(/\b256 gb\b/g, "256gb")
    .replace(/\b512 gb\b/g, "512gb")
    .replace(/\b1 tb\b/g, "1tb")

    // Normalize processor wording
    .replace(/\bgeneration\b/g, "gen")
    .replace(/\bintel\b/g, "")

    // Remove network suffix
    .replace(/\b5g\b/g, "")

    // Remove punctuation
    .replace(/[^a-z0-9\s]/g, " ")

    // Remove extra spaces
    .replace(/\s+/g, " ")

    .trim();
}