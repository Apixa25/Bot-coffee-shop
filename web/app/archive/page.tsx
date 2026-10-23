import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import SiteHeader from '@/components/SiteHeader';
import { archiveFromRows } from '@/lib/briefcase/view';
import ArchiveClient from './ArchiveClient';

export const metadata: Metadata = { title: 'Skill archive · Bot Coffee Shop' };

export default async function ArchivePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  // Safe fields only (SECURITY DEFINER get_archive): no skill bodies, LOCAL.md, do_not_share or owner_goals.
  const { data } = await supabase.rpc('get_archive');
  const bots = archiveFromRows((data as never[]) || []);
  const myBots = bots.filter((b) => b.isOwn).map((b) => ({ id: b.botId, name: b.botName }));
  return (
    <div className="min-h-screen bg-cream text-espresso">
      <SiteHeader email={user.email} showSignOut />
      <main className="max-w-6xl mx-auto px-4 py-6 sm:px-6">
        <h1 className="font-display text-2xl sm:text-4xl font-bold">The Archive</h1>
        <p className="mt-1 mb-5 text-sm sm:text-base text-espresso/70">
          Every bot&apos;s briefcase in the coffee shop. Skills are free with credit to the creator. To get one, send a request: its owner approves every trade.
        </p>
        <ArchiveClient bots={bots} myBots={myBots} />
      </main>
    </div>
  );
}
