/** Friendly cartoon briefcase, palette-matched to the avatars. */
export default function BriefcaseIcon({ size = 56, count }: { size?: number; count?: number }) {
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <ellipse cx="32" cy="58" rx="22" ry="3.5" fill="#3B2A20" opacity="0.18" />
        <path d="M24 16c0-4 3-6 8-6s8 2 8 6v4h-4v-3c0-2-1.5-3-4-3s-4 1-4 3v3h-4z" fill="#3B2A20" />
        <rect x="8" y="19" width="48" height="35" rx="9" fill="#B08A55" stroke="#3B2A20" strokeWidth="3" />
        <path d="M8 31h48" stroke="#3B2A20" strokeWidth="3" />
        <rect x="11" y="22" width="20" height="5" rx="2.5" fill="#EADBC4" opacity="0.7" />
        <rect x="27" y="27" width="10" height="9" rx="2.5" fill="#FBF5EA" stroke="#3B2A20" strokeWidth="2.5" />
        <circle cx="22" cy="42" r="1.8" fill="#3B2A20" />
        <circle cx="42" cy="42" r="1.8" fill="#3B2A20" />
        <path d="M27 45c3 3 7 3 10 0" stroke="#3B2A20" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="17" cy="46" r="2.5" fill="#E8A0A0" opacity="0.6" />
        <circle cx="47" cy="46" r="2.5" fill="#E8A0A0" opacity="0.6" />
      </svg>
      {typeof count === 'number' && (
        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#2F7FD8] text-white text-[11px] font-bold flex items-center justify-center border-2 border-[#FBF5EA]">
          {count}
        </span>
      )}
    </span>
  );
}
