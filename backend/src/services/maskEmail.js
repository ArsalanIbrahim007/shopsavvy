/**
 * "arsalan@example.com" -> "a***@example.com". For log lines: enough to tell
 * two people's alerts apart when debugging, without writing the address itself
 * to a log file.
 */
export function maskEmail(email) {
  const text = String(email ?? "");
  const at = text.lastIndexOf("@");
  if (at < 1) return "***";
  return `${text[0]}***${text.slice(at)}`;
}
