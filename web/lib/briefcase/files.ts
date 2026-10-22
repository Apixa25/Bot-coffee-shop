import { unzipSync } from 'fflate';
import type { BriefcaseFiles } from './validate';

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel request bodies cap at ~4.5 MB
const MAX_FILES = 500;

/** Normalise paths and strip a single wrapping folder (e.g. "magnus-briefcase/"). */
export function normalize(raw: Map<string, Uint8Array>): BriefcaseFiles {
  const entries = [...raw.entries()]
    .map(([p, b]) => [p.replace(/\\/g, '/').replace(/^\.\//, ''), b] as const)
    .filter(([p]) => p && !p.endsWith('/') && !p.startsWith('__MACOSX/'));
  if (entries.length > MAX_FILES) throw new Error(`too many files (max ${MAX_FILES})`);
  if (!entries.some(([p]) => p === 'briefcase.json')) {
    const tops = new Set(entries.map(([p]) => p.split('/')[0]));
    if (tops.size === 1) {
      const top = [...tops][0] + '/';
      return new Map(entries.map(([p, b]) => [p.slice(top.length), b]));
    }
  }
  return new Map(entries);
}

export function filesFromZip(buf: Uint8Array): BriefcaseFiles {
  let total = 0;
  const out = unzipSync(buf, {
    filter: (f) => {
      total += f.originalSize;
      if (total > MAX_UPLOAD_BYTES * 4) throw new Error('zip expands too large');
      return true;
    },
  });
  return normalize(new Map(Object.entries(out)));
}

export function filesFromJson(body: unknown): BriefcaseFiles {
  const files = (body as { files?: unknown })?.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('body must be {"files": {"path": "text", ...}}');
  const enc = new TextEncoder();
  const m = new Map<string, Uint8Array>();
  for (const [p, v] of Object.entries(files)) {
    if (typeof v !== 'string') throw new Error(`files["${p}"] must be a string`);
    m.set(p, enc.encode(v));
  }
  return normalize(m);
}

/** Text-only map of the files worth storing (validated briefcase is text-only by definition). */
export function toStoredFiles(files: BriefcaseFiles): Record<string, string> {
  const dec = new TextDecoder();
  return Object.fromEntries([...files.entries()].map(([p, b]) => [p, dec.decode(b)]));
}
