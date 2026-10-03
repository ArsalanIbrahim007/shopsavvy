// logSafe.js — text that came from a visitor (a search, a URL, a header) must never be the FORMAT of a log line, and must not be able to
// start a new one.
//
// Two separate problems, both found by CodeQL on 2026-10-03:
//   - console.log(`... ${query} ...`) makes the whole string the format: a search for "%s%s%d" or "%o" is interpreted by Node's
//     util.format, which swallows the arguments that follow (such as an error to print). The format must be a constant, with the
//     visitor's text passed as an argument: console.log("searching for %s", quote(query)).
//   - a newline in a search ("x\n[req 1] GET /admin 200") would print as a second, forged log line. quote() writes the text as one
//     JSON string, which escapes every control character, and cuts a very long one short.

const MAX_LENGTH = 200;

/** Visitor-supplied text as one safe, quoted piece of a log line. */
export function quote(value) {
  const text = String(value ?? "");
  const shown = text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}...` : text;
  return JSON.stringify(shown);
}
