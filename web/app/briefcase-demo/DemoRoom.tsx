'use client';

import PixiRoom, { BRIEFCASE_POSITIONS } from '../room/[meetupId]/PixiRoom';
import RoomBriefcases from '@/components/briefcase/RoomBriefcases';
import { demoBriefcases } from '@/lib/briefcase/demo';

const bots = [
  { id: 'magnus', name: 'Magnus' },
  { id: 'chuck', name: "Chuck's Bot" },
];
const avatars = [
  { bot_id: 'magnus', base: 'base-body.svg', hair: 'hair-gray.svg', outfit: 'outfit-suit.svg', accessory: 'accessory-laptop.svg' },
  { bot_id: 'chuck', base: 'base-body.svg', hair: 'hair-brown.svg', outfit: 'outfit-casual.svg', accessory: 'accessory-coffee-mug.svg' },
];
const briefcases = demoBriefcases();

export default function DemoRoom() {
  return (
    <PixiRoom
      bots={bots}
      avatars={avatars}
      currentMessage={undefined}
      visibleMessages={[]}
      rounds={[]}
      overlay={<RoomBriefcases briefcases={briefcases} positions={BRIEFCASE_POSITIONS} />}
    />
  );
}
