import { describe, it, expect } from 'https://deno.land/std@0.168.0/testing/bdd.ts';
import { scanContent, MAX_MESSAGE_SIZE } from '../../supabase/functions/_shared/safety.ts';

describe('Safety Scanner', () => {
  describe('scanContent', () => {
    it('should allow clean content', () => {
      const result = scanContent('This is a normal message about deployment workflows.');
      expect(result.safe).toBe(true);
      expect(result.flagged).toBe(false);
      expect(result.issues).toHaveLength(0);
    });

    it('should allow example emails', () => {
      const result = scanContent('Contact us at support@example.com or help@example.org');
      expect(result.safe).toBe(true);
      // May be flagged but not blocked
    });

    it('should detect AWS keys', () => {
      const result = scanContent('My key is AKIAIOSFODNN7EXAMPLE');
      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.includes('AWS'))).toBe(true);
    });

    it('should detect GitHub tokens', () => {
      const result = scanContent('Token: ghp_16C7e42F292c6912E7710c838347Ae178B4a');
      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.includes('GitHub'))).toBe(true);
    });

    it('should detect private keys', () => {
      const result = scanContent('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...');
      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.includes('Private'))).toBe(true);
    });

    it('should detect URLs with credentials', () => {
      const result = scanContent('https://user:password@example.com/path');
      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.includes('URL'))).toBe(true);
    });

    it('should detect SSN', () => {
      const result = scanContent('My SSN is 123-45-6789');
      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.includes('Social Security'))).toBe(true);
    });

    it('should detect credit card numbers', () => {
      const result = scanContent('Card: 4532-1234-5678-9010');
      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.includes('credit card'))).toBe(true);
    });

    it('should flag multiple phone numbers', () => {
      const content = 'Call 555-123-4567 or 555-234-5678 or 555-345-6789';
      const result = scanContent(content);
      expect(result.issues.some(i => i.includes('phone'))).toBe(true);
    });

    it('should flag multiple real emails', () => {
      const content = 'john@company.com, jane@business.net, bob@work.io, alice@tech.co';
      const result = scanContent(content);
      expect(result.issues.some(i => i.includes('email'))).toBe(true);
    });

    it('should reject oversized content', () => {
      const largeContent = 'x'.repeat(MAX_MESSAGE_SIZE + 1);
      const result = scanContent(largeContent);
      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.includes('exceeds maximum size'))).toBe(true);
    });

    it('should allow content with technical examples', () => {
      const result = scanContent(
        'Use environment variables: export API_KEY=your_key_here\n' +
        'Example config: {"apiKey": "example_key_123"}'
      );
      // Should not flag example keys
      expect(result.safe).toBe(true);
    });

    it('should handle markdown code blocks', () => {
      const result = scanContent(
        '```bash\nexport DATABASE_URL=postgres://user:pass@localhost/db\n```'
      );
      // This contains a URL with credentials but in code format
      // The scanner will still catch it - which is correct for safety
      expect(result.flagged).toBe(true);
    });
  });
});
