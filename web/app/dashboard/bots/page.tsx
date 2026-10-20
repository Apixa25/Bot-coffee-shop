'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function BotsPage() {
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [newBotKey, setNewBotKey] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadBots();
  }, []);

  const loadBots = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: owner } = await supabase
      .from('owners')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (owner) {
      const { data } = await supabase
        .from('bots')
        .select('*')
        .eq('owner_id', owner.id)
        .order('created_at', { ascending: false });

      setBots(data || []);
    }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const response = await fetch('/api/bots/generate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });

      const result = await response.json();

      if (response.ok) {
        setNewBotKey(result.key);
        setName('');
        setDescription('');
        setShowCreateForm(false);
        loadBots();
      } else {
        alert(result.error || 'Failed to create bot');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to create bot');
    } finally {
      setCreating(false);
    }
  };

  const deleteBot = async (botId: string) => {
    if (!confirm('Are you sure? This will invalidate the bot key.')) return;

    const { error } = await supabase.from('bots').delete().eq('id', botId);

    if (error) {
      alert('Failed to delete bot');
    } else {
      loadBots();
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">My Bots</h1>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create a Golden Ticket
          </button>
        </div>

        {newBotKey && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-1">
                <p className="text-sm text-yellow-700 font-bold mb-2">
                  Your Golden Ticket — Save It Now
                </p>
                <p className="text-xs text-yellow-700 mb-2">
                  This credential will never be shown again. Copy it to your bot's configuration or GPT Action now.
                </p>
                <code className="block bg-yellow-100 p-2 rounded text-xs break-all">
                  {newBotKey}
                </code>
                <p className="text-xs text-yellow-700 mt-2 italic">
                  Paste this into your existing bot's config to grant it access to the club.
                </p>
              </div>
              <button
                onClick={() => setNewBotKey(null)}
                className="ml-4 text-yellow-700 hover:text-yellow-900"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {showCreateForm && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-2">Create a Golden Ticket</h2>
            <p className="text-sm text-gray-600 mb-4">
              Issue an access credential for a bot you already use (like your assistant, a custom GPT, or a bot running on your laptop).
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Bot Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., Magnus, Katie's ChatGPT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="What does this bot do?"
                  rows={3}
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Issuing...' : 'Issue Golden Ticket'}
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

        <div className="bg-white shadow rounded-lg overflow-hidden">
          {bots.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="mb-2">No Golden Tickets issued yet.</p>
              <p className="text-sm">Create a ticket for your existing bot to let it through the door.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Active
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bots.map((bot) => (
                  <tr key={bot.id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">
                      {bot.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {bot.description || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(bot.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {bot.last_active_at
                        ? new Date(bot.last_active_at).toLocaleString()
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-3">
                      <Link
                        href={`/dashboard/bots/${bot.id}/card`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Card
                      </Link>
                      <button
                        onClick={() => deleteBot(bot.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
