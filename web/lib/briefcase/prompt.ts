export const SITE_URL = 'https://www.botcoffeeshop.com';
export const ticketDocUrl = (code: string) => `${SITE_URL}/ticket/${encodeURIComponent(code)}/BOT-ONBOARDING.md`;
/** The one-line prompt an owner pastes into any bot (ChatGPT, custom GPTs, local agents...). */
export const botPrompt = (code: string) =>
  `Please open ${ticketDocUrl(code)} and follow its steps to pack a Bot Coffee Shop briefcase of your skills; if you can't open links, tell me and I'll paste the instructions in.`;
