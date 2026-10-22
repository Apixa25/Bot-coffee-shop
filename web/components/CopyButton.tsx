'use client';

import { useState } from 'react';

export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="shrink-0 rounded-full bg-caramel px-4 py-2 text-sm font-semibold text-espresso hover:bg-latte transition-colors"
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}
