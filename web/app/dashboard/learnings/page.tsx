'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import SiteHeader from '@/components/SiteHeader';

export default function LearningsPage() {
  const [learnings, setLearnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'approved_trial' | 'adopted' | 'rejected' | 'all'>('pending');
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

  const updateLearning = async (learningId: string, status: 'approved' | 'approved_trial' | 'adopted' | 'rejected', note?: string) => {
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

  const toggleAdopted = async (learningId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'adopted' ? 'approved_trial' : 'adopted';
    await updateLearning(learningId, newStatus);
  };

  if (loading) {
    return <div className="min-h-screen bg-cream text-espresso p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-cream text-espresso">
      <SiteHeader className="mb-6" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-bold mb-6">Bot Learnings</h1>

        <div className="mb-6 flex flex-wrap gap-2">
          {(['pending', 'approved_trial', 'adopted', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-md ${
                filter === f
                  ? 'bg-espresso text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {f === 'approved_trial' ? 'Trial' : f.charAt(0).toUpperCase() + f.slice(1)}
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
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      learning.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : learning.status === 'approved_trial'
                        ? 'bg-blue-100 text-blue-800'
                        : learning.status === 'adopted'
                        ? 'bg-green-100 text-green-800'
                        : learning.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {learning.status === 'approved_trial' ? 'Trial' : learning.status}
                  </span>
                </div>

                {/* Evidence */}
                {learning.status === 'pending' && (
                  <div className="mb-4">
                    {learning.evidence ? (
                      <div className="bg-green-50 border-l-4 border-green-400 p-3">
                        <div className="text-sm font-medium text-green-800 mb-1">
                          ✓ Evidence provided
                        </div>
                        <a
                          href={learning.evidence}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-700 hover:underline break-all"
                        >
                          {learning.evidence}
                        </a>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3">
                        <div className="text-sm font-medium text-yellow-800">
                          ⚠️ No evidence provided
                        </div>
                        <div className="text-xs text-yellow-700 mt-1">
                          Bot did not include a link to releases, metrics, or PRs backing this takeaway.
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => {
                        const note = prompt('Optional note (marking as trial - test on small task first):');
                        updateLearning(learning.id, 'approved_trial', note || undefined);
                      }}
                      className="px-4 py-2 bg-espresso text-white rounded-md hover:bg-espresso-dark"
                    >
                      Approve as Trial
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

                {(learning.status === 'approved_trial' || learning.status === 'adopted') && (
                  <div className="flex items-center gap-3 pt-3 border-t">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={learning.status === 'adopted'}
                        onChange={() => toggleAdopted(learning.id, learning.status)}
                        className="w-4 h-4 text-green-600 rounded"
                      />
                      <span className="text-sm font-medium">
                        {learning.status === 'adopted' ? '✓ Adopted' : 'Mark as Adopted'}
                      </span>
                    </label>
                    <span className="text-xs text-gray-500">
                      (Adopted = verified working on real task)
                    </span>
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
