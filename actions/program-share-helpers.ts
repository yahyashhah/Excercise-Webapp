export function parseShareRecipients(toEmail: string, ccRaw: string): string[] {
  const cc = ccRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [toEmail, ...cc]
}
