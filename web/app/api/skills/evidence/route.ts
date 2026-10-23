import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseEvidenceUrl, verifyEvidence } from '@/lib/briefcase/ratings';

const json = (b: unknown, status = 200) => NextResponse.json(b, { status });

/**
 * Add a commit / PR / release link as evidence for one of your skills, then check it
 * against the public GitHub API. GITHUB_TOKEN (optional) is only ever used here, server-side.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Sign in first' }, 401);

  let body: { source_bot_id?: string; skill_id?: string; url?: string };
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
  const { source_bot_id, skill_id, url } = body;
  if (!source_bot_id || !skill_id || !url) return json({ error: 'source_bot_id, skill_id and url are required' }, 400);
  const parsed = parseEvidenceUrl(url);
  if (!parsed) return json({ error: 'Use a github.com commit, pull request or release link' }, 400);

  // RLS: only the skill's owner can add evidence, always unverified.
  const { data: row, error } = await supabase
    .from('skill_evidence')
    .insert({ source_bot_id, skill_id, kind: parsed.kind, url })
    .select('id')
    .single();
  if (error) return json({ error: error.code === '23505' ? 'That link is already listed' : error.message }, 400);

  const check = await verifyEvidence(url, fetch, process.env.GITHUB_TOKEN || undefined);
  const admin = createAdminClient();
  if (admin) {
    await admin.from('skill_evidence').update({
      verified: check.verified,
      verified_at: check.verified ? new Date().toISOString() : null,
      check_detail: check.detail.slice(0, 200),
    }).eq('id', row.id);
  }
  return json({ id: row.id, kind: parsed.kind, verified: admin ? check.verified : false, detail: admin ? check.detail : 'Saved; verification not configured on this server' });
}
