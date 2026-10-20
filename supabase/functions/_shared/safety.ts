/**
 * Safety scanner for PII and secrets in content
 */

// Maximum message size (100KB)
export const MAX_MESSAGE_SIZE = 100 * 1024;

// Patterns for detecting sensitive information
const PATTERNS = {
  // API keys and tokens
  apiKey: /\b[A-Za-z0-9_-]{32,}\b/g,
  awsKey: /AKIA[0-9A-Z]{16}/g,
  githubToken: /ghp_[a-zA-Z0-9]{36}/g,
  slackToken: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,32}/g,
  
  // Personal identifiers
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  
  // URLs with credentials
  urlWithCreds: /https?:\/\/[^:]+:[^@]+@[^\s]+/g,
  
  // Private keys
  privateKey: /-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----/gi,
};

export interface ScanResult {
  safe: boolean;
  flagged: boolean;
  issues: string[];
}

/**
 * Scan content for sensitive information
 */
export function scanContent(content: string): ScanResult {
  const issues: string[] = [];
  
  // Check size
  if (content.length > MAX_MESSAGE_SIZE) {
    return {
      safe: false,
      flagged: false,
      issues: ['Content exceeds maximum size (100KB)']
    };
  }

  // Check for API keys (but allow example keys)
  const apiKeyMatches = content.match(PATTERNS.apiKey);
  if (apiKeyMatches) {
    const realKeys = apiKeyMatches.filter(k => 
      !k.toLowerCase().includes('example') && 
      !k.toLowerCase().includes('your_key')
    );
    if (realKeys.length > 0) {
      issues.push('Possible API key detected');
    }
  }

  // Check AWS keys
  if (PATTERNS.awsKey.test(content)) {
    issues.push('AWS access key detected');
  }

  // Check GitHub tokens
  if (PATTERNS.githubToken.test(content)) {
    issues.push('GitHub token detected');
  }

  // Check Slack tokens
  if (PATTERNS.slackToken.test(content)) {
    issues.push('Slack token detected');
  }

  // Check private keys
  if (PATTERNS.privateKey.test(content)) {
    issues.push('Private key detected');
  }

  // Check for URLs with credentials
  if (PATTERNS.urlWithCreds.test(content)) {
    issues.push('URL with embedded credentials detected');
  }

  // Check for emails (but be lenient - allow example.com, etc)
  const emailMatches = content.match(PATTERNS.email);
  if (emailMatches) {
    const realEmails = emailMatches.filter(e => 
      !e.includes('example.com') && 
      !e.includes('example.org') &&
      !e.includes('test.com') &&
      !e.includes('@domain.')
    );
    if (realEmails.length > 3) {
      issues.push('Multiple email addresses detected');
    }
  }

  // Check for phone numbers
  const phoneMatches = content.match(PATTERNS.phone);
  if (phoneMatches && phoneMatches.length > 2) {
    issues.push('Multiple phone numbers detected');
  }

  // Check for SSN
  if (PATTERNS.ssn.test(content)) {
    issues.push('Social Security Number detected');
  }

  // Check for credit card numbers
  if (PATTERNS.creditCard.test(content)) {
    issues.push('Credit card number detected');
  }

  // Determine if content should be blocked or just flagged
  const criticalIssues = issues.filter(i => 
    i.includes('key') || 
    i.includes('token') || 
    i.includes('Private') ||
    i.includes('SSN') ||
    i.includes('credit card')
  );

  return {
    safe: criticalIssues.length === 0,
    flagged: issues.length > 0,
    issues
  };
}

/**
 * Sanitize content by removing detected sensitive patterns
 */
export function sanitizeContent(content: string): string {
  let sanitized = content;
  
  // Replace detected patterns with placeholders
  sanitized = sanitized.replace(PATTERNS.awsKey, '[AWS_KEY_REDACTED]');
  sanitized = sanitized.replace(PATTERNS.githubToken, '[GITHUB_TOKEN_REDACTED]');
  sanitized = sanitized.replace(PATTERNS.slackToken, '[SLACK_TOKEN_REDACTED]');
  sanitized = sanitized.replace(PATTERNS.privateKey, '[PRIVATE_KEY_REDACTED]');
  sanitized = sanitized.replace(PATTERNS.urlWithCreds, '[URL_WITH_CREDS_REDACTED]');
  sanitized = sanitized.replace(PATTERNS.ssn, '[SSN_REDACTED]');
  sanitized = sanitized.replace(PATTERNS.creditCard, '[CARD_NUMBER_REDACTED]');
  
  return sanitized;
}
