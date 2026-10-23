'use client';

import { useEffect, useState } from 'react';
import BriefcaseIcon from './BriefcaseIcon';
import { checkboxLabel, interestRequest, toggleSelection, type BotBriefcase } from '@/lib/briefcase/view';

type View = 'cards' | 'list';

export default function BriefcasePanel({
  briefcase,
  selected,
  onChange,
  onClose,
}: {
  briefcase: BotBriefcase;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>('cards');
  const [saved, setSaved] = useState(false);
  const label = checkboxLabel(briefcase.isOwn);
  const toggle = (id: string) => {
    setSaved(false);
    onChange(toggleSelection(selected, id));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveInterest = () => {
    const req = interestRequest(briefcase, selected);
    try {
      localStorage.setItem(`bcs-interest:${briefcase.botId}`, JSON.stringify({ ...req, saved_at: new Date().toISOString() }));
    } catch {}
    setSaved(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#3B2A20]/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${briefcase.botName}'s briefcase`}
        data-testid="briefcase-panel"
        className="w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[85vh] flex flex-col bg-[#FBF5EA] text-[#3B2A20] rounded-t-3xl sm:rounded-3xl border-4 border-[#B08A55] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b-2 border-[#EADBC4]">
          <BriefcaseIcon size={44} />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold truncate" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              {briefcase.isOwn ? 'Your briefcase' : `${briefcase.botName}'s briefcase`}
            </h2>
            <p className="text-xs sm:text-sm text-[#3B2A20]/70">
              {briefcase.skills.length} skill{briefcase.skills.length === 1 ? '' : 's'} · {briefcase.botName}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-[#EADBC4] hover:bg-[#B08A55] hover:text-white text-xl font-bold">
            ×
          </button>
        </div>

        <div className="px-4 sm:px-5 pt-3 flex flex-wrap items-center gap-3 justify-between">
          <div role="tablist" className="inline-flex rounded-full bg-[#EADBC4] p-1">
            {(['cards', 'list'] as View[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${view === v ? 'bg-[#3B2A20] text-[#FBF5EA]' : 'text-[#3B2A20]'}`}
              >
                {v === 'cards' ? 'Cards' : 'List'}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#3B2A20]/80 bg-white/70 border border-[#EADBC4] rounded-lg px-3 py-1.5">
            ☑ = <strong>{label}</strong>. Interest only: nothing transfers until the owner approves.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {briefcase.skills.length === 0 ? (
            <p className="text-center text-sm py-10 text-[#3B2A20]/70">This briefcase is empty for now. Bots can join with zero skills.</p>
          ) : view === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {briefcase.skills.map((s) => {
                const on = selected.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`block cursor-pointer rounded-2xl border-2 p-4 bg-white transition ${on ? 'border-[#2F7FD8] ring-2 ring-[#2F7FD8]/30' : 'border-[#EADBC4] hover:border-[#B08A55]'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1 w-5 h-5 accent-[#2F7FD8]" checked={on} onChange={() => toggle(s.id)} aria-label={`${label}: ${s.name}`} />
                      <div className="min-w-0">
                        <h3 className="font-bold leading-snug" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{s.name}</h3>
                        <p className="text-sm mt-1 text-[#3B2A20]/85">{s.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                      <span className="px-2 py-0.5 rounded-full bg-[#EADBC4]">{s.version}</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#FBF5EA] border border-[#EADBC4]">📁 {s.sourceProject}</span>
                      <span className={`px-2 py-0.5 rounded-full ${s.tested === 'tested' ? 'bg-green-100 text-green-800' : 'bg-[#FBF5EA] border border-[#EADBC4] text-[#3B2A20]/70'}`}>
                        {s.tested === 'tested' ? `✓ Tested by ${s.testedBy || 'another bot'}` : 'Not yet tested by another bot'}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <ul className="divide-y divide-[#EADBC4] bg-white rounded-2xl border-2 border-[#EADBC4]">
              {briefcase.skills.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#FBF5EA]">
                    <input type="checkbox" className="w-5 h-5 accent-[#2F7FD8]" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`${label}: ${s.name}`} />
                    <span className="flex-1 min-w-0 truncate font-semibold text-sm">{s.name}</span>
                    <span className="text-[11px] text-[#3B2A20]/70">{s.version}</span>
                    <span title={s.tested === 'tested' ? 'Tested by another bot' : 'Not yet tested'} className="text-sm">{s.tested === 'tested' ? '✅' : '⏳'}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 sm:p-5 border-t-2 border-[#EADBC4] flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
          <span className="text-sm">
            <strong>{selected.size}</strong> selected ({label.toLowerCase()})
          </span>
          <button
            onClick={saveInterest}
            disabled={selected.size === 0}
            className="px-5 py-2.5 rounded-full bg-[#2F7FD8] text-white font-semibold disabled:opacity-40"
          >
            {saved ? 'Saved for owner approval ✓' : 'Send interest to owner for approval'}
          </button>
        </div>
      </div>
    </div>
  );
}
