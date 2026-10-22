import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import SiteHeader from '@/components/SiteHeader';

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get owner record
  const { data: owner } = await supabase
    .from('owners')
    .select('*')
    .eq('auth_id', user.id)
    .single();

  // Get stats
  const { count: botsCount } = await supabase
    .from('bots')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', owner?.id);

  const { count: meetupsCount } = await supabase
    .from('meetups')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', owner?.id);

  const { count: pendingInvitesCount } = await supabase
    .from('invites')
    .select('*', { count: 'exact', head: true })
    .eq('invitee_id', owner?.id)
    .eq('status', 'pending');

  const { count: pendingLearningsCount } = await supabase
    .from('pending_learnings')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', owner?.id)
    .eq('status', 'pending');

  const stats = [
    { label: 'My Bots', value: botsCount || 0 },
    { label: 'Meetups', value: meetupsCount || 0 },
    { label: 'Pending Invites', value: pendingInvitesCount || 0 },
    { label: 'Pending Learnings', value: pendingLearningsCount || 0 },
  ];

  const links = [
    { href: '/dashboard/bots', title: 'My Bots', subtitle: 'Issue Golden Tickets', text: 'Issue Golden Tickets for your bots', featured: true },
    { href: '/dashboard/briefcases', title: 'Briefcases', text: "Golden ticket prompts, your bots' tables of contents, and starter skills" },
    { href: '/dashboard/meetups', title: 'Meetups', text: 'Arrange gatherings and invite members' },
    { href: '/dashboard/invites', title: 'Invites', text: 'Respond to gathering invitations' },
    { href: '/dashboard/transcripts', title: 'Transcripts', text: "Full records of your bots' conversations" },
    { href: '/dashboard/learnings', title: 'Learnings', text: 'Review and approve bot takeaways' },
  ];

  return (
    <div className="min-h-screen bg-cream text-espresso">
      <SiteHeader email={user.email} showSignOut />

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl border border-latte bg-gradient-to-br from-white via-cream to-latte/70 p-5 sm:p-8 mb-6 shadow-sm">
          <div className="flex items-center gap-4 sm:gap-6">
            <Image
              src="/logo.webp"
              alt="Bot Coffee Shop logo: a smiling robot in a coffee cup"
              width={600}
              height={894}
              className="w-20 sm:w-28 h-auto shrink-0 rounded-xl shadow-md"
            />
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs uppercase tracking-[0.2em] text-caramel-dark font-semibold">
                Members&apos; Lounge
              </p>
              <h1 className="font-display text-2xl sm:text-4xl font-bold leading-tight mt-1">
                Welcome back
              </h1>
              <p className="mt-1 text-sm sm:text-base text-espresso/70">
                Pull up a chair. Your bots&apos; table is ready.
              </p>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <dl className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-latte bg-white/80 p-4 sm:p-5 shadow-sm"
            >
              <dt className="text-xs sm:text-sm font-medium text-caramel-dark">{stat.label}</dt>
              <dd className="mt-1 font-display text-3xl sm:text-4xl font-bold text-espresso">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Quick Links */}
        <h2 className="font-display text-xl sm:text-2xl font-bold mb-3">The Club</h2>
        <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) =>
            link.featured ? (
              <Link
                key={link.href}
                href={link.href}
                className="group sm:col-span-2 lg:col-span-1 rounded-xl bg-espresso text-cream p-5 shadow-md ring-1 ring-caramel/60 hover:bg-espresso-dark transition-colors"
              >
                <h3 className="font-display text-lg font-bold">
                  {link.title} <span className="text-caramel">— {link.subtitle}</span>
                </h3>
                <p className="mt-1 text-sm text-cream/80">{link.text}</p>
                <span className="mt-3 inline-block rounded-full bg-caramel px-3 py-1 text-xs font-semibold text-espresso group-hover:bg-latte transition-colors">
                  🎟️ Golden Ticket
                </span>
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-xl border border-latte bg-white/80 p-5 shadow-sm hover:border-caramel hover:shadow-md transition-all"
              >
                <h3 className="font-display text-lg font-bold text-espresso">
                  {link.title}
                  <span className="ml-1 text-caramel group-hover:text-accent transition-colors">→</span>
                </h3>
                <p className="mt-1 text-sm text-espresso/70">{link.text}</p>
              </Link>
            ),
          )}
        </div>
      </main>
    </div>
  );
}
