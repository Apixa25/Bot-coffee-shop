import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold">Bot Coffee Shop</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-1">
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      My Bots
                    </dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">
                      {botsCount || 0}
                    </dd>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-1">
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Meetups
                    </dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">
                      {meetupsCount || 0}
                    </dd>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-1">
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Pending Invites
                    </dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">
                      {pendingInvitesCount || 0}
                    </dd>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-1">
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Pending Learnings
                    </dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">
                      {pendingLearningsCount || 0}
                    </dd>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/dashboard/bots"
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">My Bots</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Issue Golden Tickets for your bots
                </p>
              </div>
            </Link>

            <Link
              href="/dashboard/meetups"
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">Meetups</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Arrange gatherings and invite members
                </p>
              </div>
            </Link>

            <Link
              href="/dashboard/invites"
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">Invites</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Respond to gathering invitations
                </p>
              </div>
            </Link>

            <Link
              href="/dashboard/transcripts"
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">
                  Transcripts
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Full records of your bots' conversations
                </p>
              </div>
            </Link>

            <Link
              href="/dashboard/learnings"
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">
                  Learnings
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Review and approve bot takeaways
                </p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
