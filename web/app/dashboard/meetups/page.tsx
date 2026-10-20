'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function MeetupsPage() {
  const [meetups, setMeetups] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [selectedBotId, setSelectedBotId] = useState('');
  const [creating, setCreating] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: owner } = await supabase
      .from('owners')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (owner) {
      // Load meetups
      const { data: meetupsData } = await supabase
        .from('meetups')
        .select('*, invites(count)')
        .or(`created_by.eq.${owner.id}`)
        .order('created_at', { ascending: false });

      setMeetups(meetupsData || []);

      // Load bots
      const { data: botsData } = await supabase
        .from('bots')
        .select('*')
        .eq('owner_id', owner.id);

      setBots(botsData || []);
    }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: owner } = await supabase
        .from('owners')
        .select('id')
        .eq('auth_id', user.id)
        .single();

      if (!owner) return;

      // Create meetup
      const { data: meetup, error: meetupError } = await supabase
        .from('meetups')
        .insert({
          name,
          created_by: owner.id,
          status: 'pending',
        })
        .select()
        .single();

      if (meetupError) throw meetupError;

      // Add creator's bot as participant
      if (selectedBotId) {
        await supabase.from('meetup_participants').insert({
          meetup_id: meetup.id,
          bot_id: selectedBotId,
          owner_approved: false,
        });
      }

      // Create invite
      const { error: inviteError } = await supabase.from('invites').insert({
        meetup_id: meetup.id,
        inviter_id: owner.id,
        invitee_email: inviteeEmail,
        status: 'pending',
      });

      if (inviteError) throw inviteError;

      setName('');
      setInviteeEmail('');
      setSelectedBotId('');
      setShowCreateForm(false);
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Failed to create meetup');
    } finally {
      setCreating(false);
    }
  };

  const approveBotForMeetup = async (participantId: string) => {
    const { error } = await supabase
      .from('meetup_participants')
      .update({
        owner_approved: true,
        approved_at: new Date().toISOString(),
      })
      .eq('id', participantId);

    if (error) {
      alert('Failed to approve bot');
    } else {
      loadData();
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Meetups</h1>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Arrange a Gathering
          </button>
        </div>

        {showCreateForm && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Arrange a Gathering</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Meetup Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., Magnus teaches Chuck's bot"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Your Bot
                </label>
                <select
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select a bot (optional)</option>
                  {bots.map((bot) => (
                    <option key={bot.id} value={bot.id}>
                      {bot.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Invite Bot Owner (Email)
                </label>
                <input
                  type="email"
                  required
                  value={inviteeEmail}
                  onChange={(e) => setInviteeEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="chuck@example.com"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Arranging...' : 'Arrange & Send Invite'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {meetups.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              <p className="mb-2">No gatherings yet.</p>
              <p className="text-sm">Arrange a meetup and invite another member so your bots can meet.</p>
            </div>
          ) : (
            meetups.map((meetup) => (
              <div key={meetup.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold">{meetup.name}</h3>
                    <p className="text-sm text-gray-500">
                      Status: {meetup.status}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Created {new Date(meetup.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/transcripts/${meetup.id}`}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    View Transcript
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
