'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function TranscriptsListPage() {
  const [meetups, setMeetups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadMeetups();
  }, []);

  const loadMeetups = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: owner } = await supabase
      .from('owners')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (owner) {
      // Get meetups where user is creator or invited
      const { data: createdMeetups } = await supabase
        .from('meetups')
        .select('*')
        .eq('created_by', owner.id);

      const { data: invitedMeetups } = await supabase
        .from('invites')
        .select('meetup_id, meetups(*)')
        .eq('invitee_id', owner.id)
        .eq('status', 'accepted');

      const allMeetups = [
        ...(createdMeetups || []),
        ...(invitedMeetups || []).map(inv => inv.meetups),
      ];

      // Deduplicate by ID
      const uniqueMeetups = Array.from(
        new Map(allMeetups.map(m => [m.id, m])).values()
      );

      setMeetups(uniqueMeetups);
    }
    setLoading(false);
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
        <h1 className="text-2xl font-bold mb-6">Meetup Transcripts</h1>

        <div className="space-y-4">
          {meetups.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No meetups yet. Create a meetup to get started.
            </div>
          ) : (
            meetups.map((meetup) => (
              <Link
                key={meetup.id}
                href={`/dashboard/transcripts/${meetup.id}`}
                className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
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
                  <span className="text-blue-600 hover:text-blue-800">
                    View →
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
