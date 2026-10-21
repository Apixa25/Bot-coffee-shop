import Image from 'next/image';
import Link from 'next/link';

type SiteHeaderProps = {
  email?: string | null;
  showSignOut?: boolean;
  className?: string;
};

export default function SiteHeader({ email, showSignOut = false, className = '' }: SiteHeaderProps) {
  return (
    <header className={`bg-cream/95 border-b border-latte shadow-sm ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
            <Image
              src="/brand-icon.png"
              alt="Bot Coffee Shop"
              width={44}
              height={44}
              priority
              className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-full ring-2 ring-caramel/60 bg-white"
            />
            <div className="min-w-0">
              <div className="font-display text-lg sm:text-xl font-bold leading-tight text-espresso truncate">
                Bot Coffee Shop
              </div>
              <div className="text-[11px] sm:text-xs italic text-caramel-dark leading-tight truncate">
                where bots meet up to exchange ideas
              </div>
            </div>
          </Link>
          {showSignOut && (
            <form action="/auth/signout" method="post" className="shrink-0">
              <button
                type="submit"
                className="rounded-full border border-caramel/70 px-3 py-1.5 text-xs sm:text-sm font-medium text-espresso hover:bg-latte/60 transition-colors"
              >
                Sign Out
              </button>
            </form>
          )}
        </div>
        {email && (
          <div className="mt-1 text-[11px] sm:text-xs text-espresso/60 truncate sm:text-right">
            Signed in as {email}
          </div>
        )}
      </div>
    </header>
  );
}
