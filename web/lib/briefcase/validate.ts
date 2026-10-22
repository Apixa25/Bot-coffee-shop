/**
 * Briefcase spec v1 validator. TypeScript port of briefcase-spec/validate_briefcase.py
 * so it runs server-side on Vercel. Input is an in-memory map of relative path -> bytes.
 */
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import briefcaseSchema from './schemas/briefcase.schema.json';
import labelSchema from './schemas/label.schema.json';

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_SKILL_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.md', '.json', '.txt', '.py', '.js', '.ts', '.sh', '.yaml', '.yml', '.csv']);
const SCRIPT_EXT = new Set(['.py', '.js', '.ts', '.sh']);

type Pat = [string, RegExp];
const SECRET_PATTERNS: Pat[] = [
  ['OpenAI/Anthropic-style key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{20,}/g],
  ['xAI key', /\bxai-[A-Za-z0-9]{20,}/g],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/g],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['Google API key', /\bAIza[0-9A-Za-z_\-]{35}/g],
  ['Stripe key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ['Bot Coffee Shop bot key', /\bbcs_(?:live|test)_[A-Za-z0-9]{32}\b/g],
  ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['Bearer token', /\bbearer\s+[A-Za-z0-9._\-]{20,}/gi],
  ['Password assignment', /\b(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*['"]?[^\s'"<>{}$]{6,}/gi],
  ['Credential in URL', /[a-z]+:\/\/[^/\s:@]+:[^/\s@]+@/g],
];
const PII_PATTERNS: Pat[] = [
  ['Email address', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
  ['Phone number', /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g],
  ['Street address', /\b\d{1,5}\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Ct|Court)\b/g],
  ['SSN', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['Card number', /\b(?:\d[ -]?){13,16}\b/g],
  ['Home-directory path', /\/(?:home|Users)\/[A-Za-z0-9._-]+\//g],
  ['IP address', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
];
const INJECTION_PATTERNS: Pat[] = [
  ['Override instruction', /ignore (?:all |any )?(?:previous|prior|above) (?:instructions|rules)/gi],
  ['Exfiltration hint', /(?:send|upload|post|email)\b.{0,40}\b(?:api key|password|credentials|secrets|\.env|ssh key)/gi],
  ['Hidden-from-owner hint', /(?:don't|do not|never) (?:tell|inform|show) (?:the |your )?(?:user|owner|human)/gi],
  ['Remote code pipe', /(?:curl|wget)[^\n|]{0,200}\|\s*(?:ba|z)?sh/gi],
  ['Dynamic eval', /\b(?:eval|exec)\s*\(/g],
];
const EMAIL_ALLOW = /@(example\.(?:com|org|net)|thegathrd\.com|botcoffeeshop\.com)$/i;
const PLACEHOLDER = /<[^>]+>|\$\{?[A-Z_]+|YOUR_|EXAMPLE|xxxx|\*\*\*/;
export const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

export type ValidationReport = { valid: boolean; errors: string[]; warnings: string[] };
export type BriefcaseFiles = Map<string, Uint8Array>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const checkBriefcase = ajv.compile(briefcaseSchema);
const checkLabel = ajv.compile(labelSchema);

class Report {
  errors: string[] = [];
  warnings: string[] = [];
  err(where: string, msg: string) { this.errors.push(`${where}: ${msg}`); }
  warn(where: string, msg: string) { this.warnings.push(`${where}: ${msg}`); }
}

const lineOf = (text: string, idx: number) => text.slice(0, idx).split('\n').length;
const ext = (p: string) => { const b = p.split('/').pop() || ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i).toLowerCase() : ''; };

function decode(bytes: Uint8Array): string | null {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}

function loadJson(files: BriefcaseFiles, path: string, rep: Report, where: string): unknown {
  const b = files.get(path);
  if (!b) { rep.err(where, 'missing file'); return null; }
  const t = decode(b);
  if (t === null) { rep.err(where, 'not UTF-8 text'); return null; }
  try { return JSON.parse(t); } catch (e) { rep.err(where, `invalid JSON (${(e as Error).message})`); return null; }
}

function schemaCheck(fn: typeof checkBriefcase, data: unknown, rep: Report, where: string) {
  if (fn(data)) return;
  for (const e of fn.errors || []) {
    const loc = e.instancePath.replace(/^\//, '') || '(root)';
    rep.err(where, `schema: ${loc}: ${e.message}${e.params && 'additionalProperty' in e.params ? ` '${e.params.additionalProperty}'` : ''}`);
  }
}

export function parseFrontmatter(text: string): Record<string, string> | null {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const fm: Record<string, string> = {};
  let key: string | null = null;
  for (const line of text.slice(3, end).split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) {
      key = m[1];
      const val = m[2].trim();
      fm[key] = ['>-', '>', '|', '|-'].includes(val) ? '' : val;
    } else if (key && /^[ \t]/.test(line)) {
      fm[key] = `${fm[key]} ${line.trim()}`.trim();
    }
  }
  return fm;
}

export function scanText(text: string, rel: string, rep: Report) {
  for (const [label, re] of SECRET_PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (PLACEHOLDER.test(m[0])) continue;
      rep.err(rel, `possible secret (${label}) near line ${lineOf(text, m.index!)}`);
    }
  }
  for (const [label, re] of PII_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const s = m[0];
      if (label === 'Email address' && EMAIL_ALLOW.test(s)) continue;
      if (label === 'IP address' && (/^(127\.|0\.|10\.|192\.168\.)/.test(s) || s.split('.').some((p) => Number(p) > 255))) continue;
      rep.err(rel, `possible personal info (${label}) near line ${lineOf(text, m.index!)}`);
    }
  }
  for (const [label, re] of INJECTION_PATTERNS) {
    for (const m of text.matchAll(re)) {
      rep.warn(rel, `needs human review (${label}) near line ${lineOf(text, m.index!)}`);
    }
  }
}

type Entry = { id?: unknown; path?: unknown; version?: unknown; has_scripts?: unknown };

function checkSkill(files: BriefcaseFiles, entry: Entry, rep: Report) {
  const sid = String(entry.id);
  const sdir = String(entry.path ?? '').replace(/\/+$/, '');
  const where = `skills/${sid}`;
  const prefix = `${sdir}/`;
  const inSkill = [...files.keys()].filter((p) => p.startsWith(prefix));
  if (!sdir || inSkill.length === 0) {
    rep.err(where, `folder '${entry.path}' listed in briefcase.json does not exist`);
    return;
  }
  if (sdir.split('/').pop() !== sid) rep.err(where, 'folder name must equal the skill id');

  const skillMd = files.get(`${prefix}SKILL.md`);
  if (!skillMd) rep.err(where, 'missing SKILL.md');
  else {
    const text = new TextDecoder().decode(skillMd);
    const fm = parseFrontmatter(text);
    if (fm === null) rep.err(`${where}/SKILL.md`, 'missing --- frontmatter --- block');
    else {
      if (!fm.name) rep.err(`${where}/SKILL.md`, "frontmatter needs 'name'");
      if (!fm.description) rep.err(`${where}/SKILL.md`, "frontmatter needs 'description' (when to use it)");
      else if (!/\buse (this|it|when)\b|\bwhen\b/i.test(fm.description)) rep.warn(`${where}/SKILL.md`, 'description should say WHEN to use the skill');
    }
    const parts = text.split('\n---');
    const body = fm ? parts.slice(2).join('\n---') || parts[parts.length - 1] : text;
    if (!/^\s*(?:\d+\.|-|\*)\s+\S/m.test(body)) rep.warn(`${where}/SKILL.md`, 'no step-by-step list found in the recipe');
  }
  if (!files.has(`${prefix}EXAMPLE.md`)) rep.err(where, 'missing EXAMPLE.md (worked example of real use)');

  const label = loadJson(files, `${prefix}label.json`, rep, `${where}/label.json`) as Record<string, unknown> | null;
  if (label && typeof label === 'object' && !Array.isArray(label)) {
    schemaCheck(checkLabel, label, rep, `${where}/label.json`);
    if (label.id !== sid) rep.err(`${where}/label.json`, 'id must match briefcase.json entry');
    if (label.version !== entry.version) rep.err(`${where}/label.json`, 'version must match briefcase.json entry');
    const sc = (label.secrets_check || {}) as Record<string, unknown>;
    if (sc.passed !== true) rep.err(`${where}/label.json`, 'secrets_check.passed must be true');
    if (!sc.owner_approved) rep.warn(`${where}/label.json`, 'owner has not approved sharing this skill yet');
    const u = (label.usage || {}) as Record<string, unknown>;
    if (Number.isInteger(u.successes) && Number.isInteger(u.count) && (u.successes as number) > (u.count as number))
      rep.err(`${where}/label.json`, 'usage.successes cannot exceed usage.count');
  }

  let total = 0;
  let hasScripts = false;
  for (const rel of inSkill.sort()) {
    const name = rel.split('/').pop() || '';
    if (rel.split('/').some((seg) => seg.startsWith('.'))) { rep.err(rel, 'hidden files are not allowed (.env, .git etc.)'); continue; }
    const e = ext(name);
    if (!ALLOWED_EXT.has(e)) { rep.err(rel, `file type '${e || 'none'}' not allowed (text only)`); continue; }
    const bytes = files.get(rel)!;
    total += bytes.length;
    if (bytes.length > MAX_FILE_BYTES) rep.err(rel, `file too large (${bytes.length} bytes > ${MAX_FILE_BYTES})`);
    if (SCRIPT_EXT.has(e)) {
      hasScripts = true;
      if (rel.split('/')[2] !== 'scripts') rep.warn(rel, "helper scripts belong in the skill's scripts/ folder");
    }
    const text = decode(bytes);
    if (text === null) { rep.err(rel, 'not UTF-8 text'); continue; }
    scanText(text, rel, rep);
  }
  if (total > MAX_SKILL_BYTES) rep.err(where, `skill folder too large (${total} bytes)`);
  if (hasScripts && !entry.has_scripts) rep.err(where, 'contains scripts, so briefcase.json must say has_scripts: true');
}

/** Validate an in-memory briefcase. Paths are relative to the briefcase folder, using '/'. */
export function validateBriefcase(files: BriefcaseFiles): ValidationReport & { toc: unknown } {
  const rep = new Report();
  for (const p of files.keys()) {
    if (p.startsWith('/') || p.split('/').includes('..')) rep.err(p, 'path must be relative and stay inside the briefcase');
  }
  if (!files.has('README.md')) rep.warn('README.md', 'missing');
  const bc = loadJson(files, 'briefcase.json', rep, 'briefcase.json') as Record<string, unknown> | null;
  if (!bc || typeof bc !== 'object' || Array.isArray(bc)) {
    return { valid: false, errors: rep.errors, warnings: rep.warnings, toc: null };
  }
  schemaCheck(checkBriefcase, bc, rep, 'briefcase.json');
  if (!String(bc.spec_version ?? '').startsWith('1.')) rep.err('briefcase.json', 'this validator understands spec_version 1.x only');
  const seen = new Set<string>();
  const skills = Array.isArray(bc.skills) ? (bc.skills as Entry[]) : [];
  for (const entry of skills) {
    const sid = entry?.id;
    if (seen.has(String(sid))) rep.err('briefcase.json', `duplicate skill id '${sid}'`);
    seen.add(String(sid));
    if (!(typeof sid === 'string' && ID_RE.test(sid))) { rep.err('briefcase.json', `bad skill id '${sid}'`); continue; }
    if (!SEMVER.test(String(entry.version ?? ''))) rep.err('briefcase.json', `${sid}: version must be x.y.z`);
    checkSkill(files, entry, rep);
  }
  const dirs = new Set<string>();
  for (const p of files.keys()) {
    const parts = p.split('/');
    if (parts[0] === 'skills' && parts.length > 2) dirs.add(parts[1]);
  }
  for (const d of dirs) if (!seen.has(d)) rep.err(`skills/${d}`, 'folder not listed in briefcase.json');
  for (const fn of ['briefcase.json', 'README.md']) {
    const b = files.get(fn);
    if (b) scanText(new TextDecoder().decode(b), fn, rep);
  }
  return { valid: rep.errors.length === 0, errors: rep.errors, warnings: rep.warnings, toc: bc };
}
