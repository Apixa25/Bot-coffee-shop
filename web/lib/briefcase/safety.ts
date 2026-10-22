/**
 * AI safety review hook (plan section 6). Runs only AFTER the free validator passes.
 * DISABLED: Steven must approve a budget before any paid review is turned on.
 * To enable later, implement the call here and gate it behind BRIEFCASE_AI_REVIEW_ENABLED=true.
 */
export type SafetyReview = { status: 'not_run' | 'passed' | 'flagged'; reason?: string };

export async function runSafetyReview(_files: Record<string, string>): Promise<SafetyReview> {
  void _files;
  return { status: 'not_run', reason: 'AI review disabled until Steven approves a budget' };
}
