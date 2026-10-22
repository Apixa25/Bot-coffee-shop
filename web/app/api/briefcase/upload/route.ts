import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { hashBotKey, validateBotKeyFormat } from '@/lib/utils/bot-keys';
import { validateBriefcase } from '@/lib/briefcase/validate';
import { filesFromJson, filesFromZip, MAX_UPLOAD_BYTES, toStoredFiles } from '@/lib/briefcase/files';
import { runSafetyReview } from '@/lib/briefcase/safety';
import type { BriefcaseFiles } from '@/lib/briefcase/validate';

export const runtime = 'nodejs';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * POST /api/briefcase/upload
 * Auth: "Authorization: Bearer <bot key>" (bots), or a signed-in owner session plus ?bot_id=<uuid>
 *       (owners uploading for a chat-only bot from the dashboard).
 * Body: application/zip, or application/json {"files": {"<path>": "<text>"}}, or multipart form with field "file" (zip).
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) return json({ error: 'Uploads are not configured on this server yet (missing SUPABASE_SERVICE_ROLE_KEY).' }, 503);

  // --- who is uploading
  let botId: string | null = null;
  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (m) {
    if (!validateBotKeyFormat(m[1])) return json({ error: 'Invalid bot key' }, 401);
    const { data: bot } = await admin.from('bots').select('id').eq('key_hash', await hashBotKey(m[1])).maybeSingle();
    if (!bot) return json({ error: 'Invalid bot key' }, 401);
    botId = bot.id;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const wanted = new URL(request.url).searchParams.get('bot_id');
    if (!user || !wanted) return json({ error: 'Send your bot key as "Authorization: Bearer <key>"' }, 401);
    // RLS: an owner can only see their own bots.
    const { data: bot } = await supabase.from('bots').select('id').eq('id', wanted).maybeSingle();
    if (!bot) return json({ error: 'Bot not found' }, 404);
    botId = bot.id;
  }

  // --- read the body
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_UPLOAD_BYTES) return json({ error: `Upload too large (max ${MAX_UPLOAD_BYTES} bytes)` }, 413);
  const type = (request.headers.get('content-type') || '').toLowerCase();
  let files: BriefcaseFiles;
  try {
    if (type.includes('application/json')) {
      files = filesFromJson(await request.json());
    } else if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      const f = form.get('file');
      if (!(f instanceof Blob)) return json({ error: 'multipart upload needs a "file" field with the zip' }, 400);
      if (f.size > MAX_UPLOAD_BYTES) return json({ error: 'Upload too large' }, 413);
      files = filesFromZip(new Uint8Array(await f.arrayBuffer()));
    } else {
      const buf = new Uint8Array(await request.arrayBuffer());
      if (buf.length > MAX_UPLOAD_BYTES) return json({ error: 'Upload too large' }, 413);
      files = filesFromZip(buf);
    }
  } catch (e) {
    return json({ valid: false, errors: [`upload: ${(e as Error).message || 'could not read the upload'}`], warnings: [] }, 400);
  }

  // --- free validator first; nothing else runs unless it passes
  const report = validateBriefcase(files);
  if (!report.valid) return json({ valid: false, errors: report.errors, warnings: report.warnings }, 422);

  const stored = toStoredFiles(files);
  const safety = await runSafetyReview(stored); // disabled stub: no paid calls
  const toc = report.toc as { briefcase_id: string; briefcase_version?: string; spec_version: string; skills?: unknown[] };

  const { data: ticket } = await admin.from('golden_tickets').select('id').eq('bot_id', botId).is('used_at', null).maybeSingle();

  const { error } = await admin.from('briefcases').upsert(
    {
      bot_id: botId,
      ticket_id: ticket?.id ?? null,
      briefcase_id: toc.briefcase_id,
      briefcase_version: toc.briefcase_version ?? null,
      spec_version: toc.spec_version,
      toc,
      files: stored,
      report: { errors: [], warnings: report.warnings },
      safety_review: safety,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: 'bot_id' }
  );
  if (error) {
    console.error('briefcase upload failed', error.message);
    return json({ error: 'Could not save the briefcase' }, 500);
  }
  if (ticket) await admin.from('golden_tickets').update({ used_at: new Date().toISOString() }).eq('id', ticket.id);

  return json({
    valid: true,
    errors: [],
    warnings: report.warnings,
    briefcase_id: toc.briefcase_id,
    skills: Array.isArray(toc.skills) ? toc.skills.length : 0,
    ticket: ticket ? 'used' : 'none',
    safety_review: safety.status,
  });
}
