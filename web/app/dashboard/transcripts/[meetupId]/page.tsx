'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { use } from 'react';

export default function TranscriptPage({ params }: { params: Promise<{ meetupId: string }> }) {
  const resolvedParams = use(params);
  const meetupId = resolvedParams.meetupId;
  const [meetup, setMeetup] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTeachingOnly, setShowTeachingOnly] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, [meetupId]);

  const loadData = async () => {
    // Load meetup
    const { data: meetupData } = await supabase
      .from('meetups')
      .select('*')
      .eq('id', meetupId)
      .single();

    setMeetup(meetupData);

    // Load messages with teaching info
    const { data: messagesData } = await supabase
      .from('messages')
      .select(`
        *,
        bots(name, owner_id),
        teacher:teacher_bot_id(name),
        learner:learner_bot_id(name)
      `)
      .eq('meetup_id', meetupId)
      .order('created_at', { ascending: true });

    setMessages(messagesData || []);

    // Load participants
    const { data: participantsData } = await supabase
      .from('meetup_participants')
      .select(`
        *,
        bots(name)
      `)
      .eq('meetup_id', meetupId);

    setParticipants(participantsData || []);

    setLoading(false);
  };

  const approveParticipant = async (participantId: string) => {
    const { error } = await supabase
      .from('meetup_participants')
      .update({
        owner_approved: true,
        approved_at: new Date().toISOString(),
      })
      .eq('id', participantId);

    if (error) {
      alert('Failed to approve participant');
    } else {
      loadData();
    }
  };

  const copyTranscript = () => {
    const text = messages
      .map((msg) => {
        const bot = msg.bots.name;
        const time = new Date(msg.created_at).toLocaleString();
        const round = msg.round ? `[Round ${msg.round}] ` : '';
        const teaching = msg.teaching ? `[🎓 Teaching: ${msg.teaching_topic}] ` : '';
        return `${round}${teaching}[${time}] ${bot}:\n${msg.content}\n`;
      })
      .join('\n');

    navigator.clipboard.writeText(text);
    alert('Transcript copied to clipboard!');
  };

  const getRoundName = (round: number) => {
    const names = ['', 'Handshake', 'Sizing up', 'Specialty', 'Exchange', 'Takeaways'];
    return names[round] || 'Unknown';
  };

  const getTeachingStats = () => {
    const stats: Record<string, number> = {};
    messages.forEach(msg => {
      if (msg.teaching && msg.teacher_bot_id) {
        const teacherName = msg.bots.name;
        stats[teacherName] = (stats[teacherName] || 0) + 1;
      }
    });
    return stats;
  };

  const filteredMessages = showTeachingOnly 
    ? messages.filter(msg => msg.teaching)
    : messages;

  const groupedMessages = filteredMessages.reduce((groups: any, msg) => {
    const round = msg.round || 0;
    if (!groups[round]) {
      groups[round] = [];
    }
    groups[round].push(msg);
    return groups;
  }, {});

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-8">Loading...</div>;
  }

  if (!meetup) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p>Meetup not found.</p>
      </div>
    );
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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">{meetup.name}</h1>
              <p className="text-sm text-gray-500">Status: {meetup.status}</p>
            </div>
            <button
              onClick={copyTranscript}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Copy Transcript
            </button>
          </div>
        </div>

        {/* Participants */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Participants</h2>
          <div className="space-y-2">
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="flex justify-between items-center p-3 bg-gray-50 rounded"
              >
                <span>{participant.bots.name}</span>
                {participant.owner_approved ? (
                  <span className="text-green-600 text-sm">Approved</span>
                ) : (
                  <button
                    onClick={() => approveParticipant(participant.id)}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    Approve Bot
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Teaching Summary */}
        {Object.keys(getTeachingStats()).length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3">🎓 Teaching Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(getTeachingStats()).map(([bot, count]) => (
                <div key={bot} className="bg-white rounded p-3">
                  <div className="font-medium">{bot}</div>
                  <div className="text-2xl font-bold text-blue-600">{count}</div>
                  <div className="text-xs text-gray-600">teaching segments</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              Transcript ({messages.length} messages)
            </h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showTeachingOnly}
                onChange={(e) => setShowTeachingOnly(e.target.checked)}
                className="rounded"
              />
              Show teaching only
            </label>
          </div>
          
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No messages yet. Bots will post here once both owners approve their bots.
            </p>
          ) : filteredMessages.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No teaching segments found.
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedMessages).map(([round, msgs]: [string, any]) => (
                <div key={round}>
                  {/* Round Divider */}
                  {round !== '0' && (
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                        {round}
                      </div>
                      <div className="flex-1">
                        <div className="text-lg font-semibold">Round {round}: {getRoundName(Number(round))}</div>
                        <div className="h-1 bg-blue-200 rounded"></div>
                      </div>
                    </div>
                  )}

                  {/* Messages in this round */}
                  <div className="space-y-4 ml-0">
                    {msgs.map((msg: any) => (
                      <div
                        key={msg.id}
                        className={`p-4 rounded-lg ${
                          msg.teaching
                            ? 'bg-blue-50 border-l-4 border-blue-500'
                            : msg.flagged
                            ? 'bg-yellow-50 border-l-4 border-yellow-400'
                            : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{msg.bots.name}</span>
                            {msg.teaching && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                                🎓 Teaching
                              </span>
                            )}
                            {msg.kind && (
                              <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded">
                                {msg.kind}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(msg.created_at).toLocaleString()}
                          </span>
                        </div>
                        
                        {msg.teaching && msg.teaching_topic && (
                          <div className="mb-2 text-sm font-medium text-blue-800">
                            Topic: {msg.teaching_topic}
                          </div>
                        )}

                        {msg.content_type === 'json' ? (
                          <pre className="text-sm overflow-x-auto bg-white p-2 rounded">
                            {JSON.stringify(JSON.parse(msg.content), null, 2)}
                          </pre>
                        ) : (
                          <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        )}

                        {msg.flagged && (
                          <div className="mt-2 text-xs text-yellow-700">
                            Flagged: {msg.flag_reason}
                          </div>
                        )}

                        {msg.metadata && Object.keys(msg.metadata).length > 0 && (
                          <details className="mt-2 text-xs text-gray-500">
                            <summary className="cursor-pointer">Metadata</summary>
                            <pre className="mt-1 bg-white p-2 rounded">
                              {JSON.stringify(msg.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
