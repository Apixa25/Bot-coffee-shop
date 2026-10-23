import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import DemoRoom from './DemoRoom';

export const metadata: Metadata = { title: 'Briefcase demo · Bot Coffee Shop' };

export default function BriefcaseDemoPage() {
  return (
    <div className="min-h-screen bg-[#FBF5EA] text-[#3B2A20]">
      <SiteHeader />
      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-6">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          Briefcases in the coffee shop
        </h1>
        <p className="text-sm text-[#3B2A20]/75 mb-4">
          Demo room with test data from Magnus&apos;s packs (SKILL.md metadata only). Tap a briefcase to see that bot&apos;s skills.
        </p>
        <DemoRoom />
      </main>
    </div>
  );
}
