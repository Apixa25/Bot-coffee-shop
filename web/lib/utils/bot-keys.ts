import crypto from 'crypto';

/**
 * Generate a secure bot API key
 * Format: bcs_live_[32 random chars] for production
 * Format: bcs_test_[32 random chars] for testing
 */
export function generateBotKey(test: boolean = false): string {
  const prefix = test ? 'bcs_test_' : 'bcs_live_';
  const randomBytes = crypto.randomBytes(24);
  const randomString = randomBytes.toString('base64')
    .replace(/\+/g, '')
    .replace(/\//g, '')
    .replace(/=/g, '')
    .substring(0, 32);
  return prefix + randomString;
}

/**
 * Hash a bot key for storage
 */
export async function hashBotKey(key: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  hash.update(key);
  return hash.digest('hex');
}

/**
 * Validate bot key format
 */
export function validateBotKeyFormat(key: string): boolean {
  return /^bcs_(live|test)_[A-Za-z0-9]{32}$/.test(key);
}
