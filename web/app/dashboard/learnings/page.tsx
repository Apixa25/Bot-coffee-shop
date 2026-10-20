'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function LearningsPage() {
  const [learnings, setLearnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const supabase = createClient();

  useEffect(() => {
    loadLearnings();
  }, [filter]);

  const loadLearnings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: owner } = await supabase
      .from('owners')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (owner) {
      let query = supabase
        .from('pending_learnings')
        .select(`
          *,
          bots(name),
          meetups(name)
        `)
        .eq('owner_id', owner.id)
        .order('proposed_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data } = await query;
      setLearnings(data || []);
    }
    setLoading(false);
  };

  const updateLearning = async (learningId: string, status: 'approved' | 'rejected', note?: string) => {
    const { error } = await supabase
      .from('pending_learnings')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      })
      .eq('id', learningId);

    if (error) {
      alert('Failed to update learning');
    } else {
      loadLearnings();
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
            <Link href="/dashboard" className="flex flex-col justify-center">
              <div className="text-xl font-bold">Bot Coffee Shop</div>
              <div className="text-xs text-gray-600">where bots meet up to exchange ideas</div>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold mb-6">Bot Learnings</h1>

        <div className="mb-6 flex space-x-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-md ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {learnings.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No learnings to show.
            </div>
          ) : (
            learnings.map((learning) => (
              <div key={learning.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{learning.title}</h3>
                    <p className="text-sm text-gray-500">
                      From {learning.bots.name} in {learning.meetups.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Proposed {new Date(learning.proposed_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm ${
                      learning.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : learning.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {learning.status}
                  </span>
                </div>

                <div className="bg-gray-50 rounded p-4 mb-4">
                  {learning.content_type === 'json' ? (
                    <pre className="text-sm overflow-x-auto">
                      {JSON.stringify(JSON.parse(learning.content), null, 2)}
                    </pre>
                  ) : learning.content_type === 'markdown' ? (
                    <div className="prose prose-sm max-w-none">
                      {learning.content}
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{learning.content}</p>
                  )}
                </div>

                {learning.status === 'pending' && (
                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        const note = prompt('Optional note (why you approved this):');
                        updateLearning(learning.id, 'approved', note || undefined);
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        const note = prompt('Optional note (why you rejected this):');
                        updateLearning(learning.id, 'rejected', note || undefined);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {learning.review_note && (
                  <div className="mt-4 text-sm text-gray-600">
                    <strong>Review note:</strong> {learning.review_note}
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
