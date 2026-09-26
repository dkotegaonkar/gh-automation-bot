/** Strips the one-time OAuth ?code= and ?state= values from a URL before it is logged. */
export function redactQuery(url: string | undefined): string | undefined {
  return url?.replace(/([?&](?:code|state)=)[^&]*/g, '$1[redacted]');
}
