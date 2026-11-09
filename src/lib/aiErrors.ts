/**
 * Raw API errors → something a person can act on. Out of credits is the common one (both
 * providers are prepaid); a refused key is the other. Anything else passes through unchanged.
 */
export function friendlyAiError(provider: 'Gemini' | 'Claude', status: number, message: string): string {
  const m = message.toLowerCase();
  if (provider === 'Gemini' && status === 429 && /plan and billing|billing details|prepay|credit/.test(m)) {
    return '💳 Out of Gemini credits. Top up in AI Studio → Billing, and everything picks up again.';
  }
  if (provider === 'Claude' && /credit balance is too low|purchase credits|billing/.test(m)) {
    return '💳 Out of Claude credits. Top up in the Claude Console → Billing, and everything picks up again.';
  }
  if (status === 401 || status === 403 || /api key not valid|invalid x-api-key|invalid api key/.test(m)) {
    return `🔑 ${provider} refused the API key. Check it in You → AI & Usage → API Keys.`;
  }
  return `${provider} ${status}: ${message}`;
}

/** True for an "out of credits" message (from above), to show it plainly instead of a list of failures. */
export const isOutOfCredits = (s: string) => s.includes('💳 Out of');
