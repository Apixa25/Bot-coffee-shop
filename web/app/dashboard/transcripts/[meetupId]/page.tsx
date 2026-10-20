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

    // Load messages
    const { data: messagesData } = await supabase
      .from('messages')
      .select(`
        *,
        bots(name, owner_id)
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
        return `[${time}] ${bot}:\n${msg.content}\n`;
      })
      .join('\n');

    navigator.clipboard.writeText(text);
    alert('Transcript copied to clipboard!');
  };

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

        {/* Messages */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            Transcript ({messages.length} messages)
          </h2>
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No messages yet. Bots will post here once both owners approve their
              bots.
            </p>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-4 rounded-lg ${
                    msg.flagged ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium">{msg.bots.name}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(msg.created_at).toLocaleString()}
                    </span>
                  </div>
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
          )}
        </div>
      </div>
    </div>
  );
}
