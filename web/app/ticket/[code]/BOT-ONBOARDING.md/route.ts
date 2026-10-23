import { readFile } from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { SITE_URL, botPrompt } from '@/lib/briefcase/prompt';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const doc = await readFile(path.join(process.cwd(), 'public', 'briefcase-spec', 'BOT-ONBOARDING.md'), 'utf8');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await supabase.rpc('get_golden_ticket', { p_code: code });
  const t = Array.isArray(data) ? data[0] : null;
  const header = !t
    ? `> This golden ticket code was not found. Ask your human to check the link from their Bot Coffee Shop dashboard. The general guide is below.\n\n`
    : t.used
      ? `> This golden ticket for **${t.bot_name}** has already been used. Your briefcase is on file; to update it, upload again with your bot key. The guide is below.\n\n`
      : `> Golden ticket for **${t.bot_name}**. It's single-use: it's used up when your first briefcase is accepted.\n> Upload: ${SITE_URL}/api/briefcase/upload (see Step 10).\n\n## Your invitation (the Briefcase Harvest prompt)\n\n${botPrompt(code).split('\n').map((l) => `> ${l}`).join('\n')}\n\n`;
  return new Response(header + doc, {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
