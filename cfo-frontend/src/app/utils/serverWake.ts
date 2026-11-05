/**
 * Keeps login and page loads from hanging on a silent spinner while the backend
 * wakes up after an idle period.
 *
 * Only for quick requests that are safe to repeat. Uploads and AI calls can
 * legitimately run for minutes, so they must keep using plain fetch.
 */

const NOTICE_AFTER_MS = 8_000;
const ATTEMPT_TIMEOUT_MS = 60_000;
const GIVE_UP_AFTER_MS = 180_000;
const RETRY_DELAY_MS = 5_000;
const GATEWAY_ERRORS = new Set([502, 503, 504]);

let slowRequests = 0;
const listeners = new Set<() => void>();

function changeSlowRequests(delta: number): void {
  slowRequests += delta;
  listeners.forEach((listener) => listener());
}

export function subscribeServerWake(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isServerWaking(): boolean {
  return slowRequests > 0;
}

/** Retries network failures, timeouts and gateway errors until the server answers
 *  or GIVE_UP_AFTER_MS passes. Any other response is returned untouched. */
export async function fetchWhileServerWakes(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const giveUpAt = Date.now() + GIVE_UP_AFTER_MS;
  let noticeShown = false;
  const noticeTimer = setTimeout(() => {
    noticeShown = true;
    changeSlowRequests(1);
  }, NOTICE_AFTER_MS);

  try {
    for (;;) {
      try {
        const res = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        });
        if (!GATEWAY_ERRORS.has(res.status) || Date.now() >= giveUpAt) return res;
      } catch {
        if (Date.now() >= giveUpAt) {
          throw new Error(
            'The server is taking too long to respond. Please try again in a minute.',
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  } finally {
    clearTimeout(noticeTimer);
    if (noticeShown) changeSlowRequests(-1);
  }
}
