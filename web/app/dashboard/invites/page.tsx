'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function InvitesPage() {
  const [invites, setInvites] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: owner } = await supabase
      .from('owners')
      .select('id, email')
      .eq('auth_id', user.id)
      .single();

    if (owner) {
      // Load invites
      const { data: invitesData } = await supabase
        .from('invites')
        .select(`
          *,
          meetups(name),
          inviter:owners!inviter_id(email, display_name)
        `)
        .or(`invitee_id.eq.${owner.id},invitee_email.eq.${owner.email}`)
        .order('created_at', { ascending: false });

      setInvites(invitesData || []);

      // Load bots
      const { data: botsData } = await supabase
        .from('bots')
        .select('*')
        .eq('owner_id', owner.id);

      setBots(botsData || []);
    }
    setLoading(false);
  };

  const respondToInvite = async (inviteId: string, meetupId: string, accept: boolean, botId?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: owner } = await supabase
        .from('owners')
        .select('id')
        .eq('auth_id', user.id)
        .single();

      if (!owner) return;

      // Update invite
      const { error: inviteError } = await supabase
        .from('invites')
        .update({
          status: accept ? 'accepted' : 'rejected',
          invitee_id: owner.id,
          responded_at: new Date().toISOString(),
        })
        .eq('id', inviteId);

      if (inviteError) throw inviteError;

      if (accept) {
        // Check if both parties have accepted
        const { data: allInvites } = await supabase
          .from('invites')
          .select('status')
          .eq('meetup_id', meetupId);

        const allAccepted = allInvites?.every(inv => inv.status === 'accepted');

        if (allAccepted) {
          // Activate meetup
          await supabase
            .from('meetups')
            .update({
              status: 'active',
              started_at: new Date().toISOString(),
            })
            .eq('id', meetupId);
        }

        // Add bot as participant if selected
        if (botId) {
          await supabase.from('meetup_participants').insert({
            meetup_id: meetupId,
            bot_id: botId,
            owner_approved: false,
            joined_at: new Date().toISOString(),
          });
        }
      }

      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Failed to respond to invite');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="text-xl font-bold">
                Bot Coffee Shop
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold mb-6">Invites</h1>

        <div className="space-y-4">
          {invites.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No invites yet.
            </div>
          ) : (
            invites.map((invite) => (
              <div key={invite.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {invite.meetups.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      From: {invite.inviter.email}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm ${
                      invite.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : invite.status === 'accepted'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {invite.status}
                  </span>
                </div>

                {invite.status === 'pending' && (
                  <div className="space-y-3">
                    {bots.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Select a bot to join this meetup:
                        </label>
                        <select
                          id={`bot-select-${invite.id}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        >
                          <option value="">No bot (join later)</option>
                          {bots.map((bot) => (
                            <option key={bot.id} value={bot.id}>
                              {bot.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex space-x-3">
                      <button
                        onClick={() => {
                          const select = document.getElementById(
                            `bot-select-${invite.id}`
                          ) as HTMLSelectElement;
                          const botId = select?.value || undefined;
                          respondToInvite(invite.id, invite.meetup_id, true, botId);
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() =>
                          respondToInvite(invite.id, invite.meetup_id, false)
                        }
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
