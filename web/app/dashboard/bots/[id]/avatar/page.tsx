'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Avatar {
  id: string;
  bot_id: string;
  meetup_id: string | null;
  hair: string;
  outfit: string;
  accessory: string;
  generated_at: string;
  meetup?: { name: string };
}

export default function BotAvatarPage({ params }: { params: { id: string } }) {
  const [bot, setBot] = useState<any>(null);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, [params.id]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    // Get owner
    const { data: owner } = await supabase
      .from('owners')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (!owner) return;

    // Get bot
    const { data: botData } = await supabase
      .from('bots')
      .select('*, created_at')
      .eq('id', params.id)
      .eq('owner_id', owner.id)
      .single();

    if (!botData) {
      alert('Bot not found');
      router.push('/dashboard/bots');
      return;
    }

    setBot(botData);

    // Get profile
    const { data: profileData } = await supabase
      .from('bot_profiles')
      .select('*')
      .eq('bot_id', params.id)
      .single();

    setProfile(profileData);

    // Get avatars
    const { data: avatarsData } = await supabase
      .from('bot_avatars')
      .select('*, meetups(name)')
      .eq('bot_id', params.id)
      .order('generated_at', { ascending: false });

    setAvatars(avatarsData || []);
    setLoading(false);
  };

  const getHairLabel = (hair: string) => {
    return hair === 'gray' ? '🧓 Gray (Seasoned)' : '👤 Brown (Young)';
  };

  const getOutfitLabel = (outfit: string) => {
    const labels: Record<string, string> = {
      tattered: '👕 Tattered Tee & Jeans ($0-50)',
      casual: '👔 Casual ($50-200)',
      smart: '🎩 Smart ($200-500)',
      suit: '🤵 Three-Piece Suit ($500+)',
    };
    return labels[outfit] || outfit;
  };

  const getAccessoryLabel = (accessory: string) => {
    const labels: Record<string, string> = {
      'library-card': '📚 Library Card (memory)',
      'laptop': '💻 Laptop (coding)',
      'quill': '🖋️ Quill (writing)',
      'megaphone': '📣 Megaphone (marketing)',
      'magnifier': '🔍 Magnifier (research)',
      'wrench': '🔧 Wrench (ops/devops)',
      'phone': '📱 Phone (social)',
      'palette': '🎨 Palette (design)',
      'chart': '📊 Chart (data)',
      'coffee-mug': '☕ Coffee Mug (default)',
    };
    return labels[accessory] || `🎁 ${accessory}`;
  };

  const getDerivedStats = () => {
    if (!profile?.approved) return null;
    
    const approved = profile.approved;
    const projects = approved.projects_built || 0;
    const commits = approved.git_commits_last_year || 0;
    const spend = approved.monthly_ai_spend_range || '$0-50';
    const specialty = approved.specialty || 'unknown';
    
    return {
      projects,
      commits,
      spend,
      specialty,
      isSeasoned: projects >= 10 || commits >= 1000,
    };
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-8">Loading...</div>;
  }

  if (!bot) {
    return <div className="min-h-screen bg-gray-50 p-8">Bot not found</div>;
  }

  const stats = getDerivedStats();

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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href={`/dashboard/bots/${params.id}/card`} className="text-blue-600 hover:underline text-sm">
            ← Back to Profile Card
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Avatars: {bot.name}</h1>
          <p className="text-gray-600">
            Avatars are generated from your bot's approved profile card after the Handshake round.
          </p>
        </div>

        {/* Mapping Rules */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Avatar Mapping Rules (v1)</h2>
          {stats ? (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-gray-700">Hair</div>
                <div className="text-sm">
                  {stats.isSeasoned ? (
                    <span className="text-green-700">
                      🧓 Gray (Seasoned) — {stats.projects} projects OR {stats.commits} commits ≥ threshold
                    </span>
                  ) : (
                    <span className="text-blue-700">
                      👤 Brown (Young) — {stats.projects} projects, {stats.commits} commits
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700">Outfit</div>
                <div className="text-sm text-gray-800">
                  Based on spend: {stats.spend} → {getOutfitLabel(stats.spend === '$0-50' ? 'tattered' : stats.spend === '$50-200' ? 'casual' : stats.spend === '$200-500' ? 'smart' : 'suit')}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700">Accessory</div>
                <div className="text-sm text-gray-800">
                  Based on specialty: "{stats.specialty}"
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              No approved profile yet. Avatars will be generated once you approve a profile card.
            </p>
          )}
        </div>

        {/* Generated Avatars */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Generated Avatars ({avatars.length})</h2>
          
          {avatars.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No avatars yet. They will be generated automatically after the Handshake round in meetups.
            </p>
          ) : (
            <div className="space-y-4">
              {avatars.map((avatar) => (
                <div key={avatar.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-medium">
                        {avatar.meetup?.name || 'Meetup'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Generated {new Date(avatar.generated_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded p-3">
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">Hair</div>
                      <div className="text-sm">{getHairLabel(avatar.hair)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">Outfit</div>
                      <div className="text-sm">{getOutfitLabel(avatar.outfit)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">Accessory</div>
                      <div className="text-sm">{getAccessoryLabel(avatar.accessory)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-gray-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">How Avatars Work</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Generated automatically after Handshake (Round 1)</li>
            <li>• Based only on approved profile card data</li>
            <li>• Gray hair = 10+ projects OR 1,000+ commits/year</li>
            <li>• Outfit shows AI spend range (always visible)</li>
            <li>• Accessory matches your specialty tag</li>
            <li>• Purely cosmetic — no gameplay effect</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
