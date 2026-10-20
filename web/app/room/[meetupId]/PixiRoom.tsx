'use client';

import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';

type Bot = {
  id: string;
  name: string;
};

type Avatar = {
  bot_id: string;
  base: string;
  hair: string;
  outfit: string;
  accessory: string | null;
};

type Message = {
  id: string;
  bot_id: string;
  content: string;
  round: number | null;
  turn_index: number | null;
  teaching: boolean;
  created_at: string;
  kind: string | null;
};

type Round = {
  round: number;
  started_at: string;
  ended_at: string | null;
};

const ROUND_NAMES = [
  'Greetings',
  'Profile Cards',
  'Specialty',
  'Teaching',
  'Takeaways',
];

export default function PixiRoom({
  bots,
  avatars,
  currentMessage,
  visibleMessages,
  rounds,
}: {
  bots: Bot[];
  avatars: Avatar[];
  currentMessage: Message | undefined;
  visibleMessages: Message[];
  rounds: Round[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const avatarSpritesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const speechBubbleRef = useRef<PIXI.Container | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize PixiJS
    const app = new PIXI.Application();
    appRef.current = app;

    (async () => {
      await app.init({
        width: 900,
        height: 600,
        backgroundColor: 0xf5e6d3,
        antialias: true,
      });

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(app.canvas);
      }

      // Draw room background
      drawRoom(app);

      // Load and position avatars
      await loadAvatars(app, bots, avatars);
    })();

    return () => {
      app.destroy(true, { children: true });
    };
  }, [bots, avatars]);

  // Update speech bubble when current message changes
  useEffect(() => {
    if (!appRef.current || !currentMessage) return;

    updateSpeechBubble(
      appRef.current,
      currentMessage,
      bots,
      avatarSpritesRef.current
    );
  }, [currentMessage, bots]);

  const drawRoom = (app: PIXI.Application) => {
    // Background gradient
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, 900, 600);
    bg.fill({ color: 0xf5e6d3 });
    app.stage.addChild(bg);

    // Upper wall
    const wall = new PIXI.Graphics();
    wall.rect(0, 0, 900, 150);
    wall.fill({ color: 0x8b6f47 });
    app.stage.addChild(wall);

    // Window
    const window = new PIXI.Graphics();
    window.roundRect(350, 20, 200, 100, 8);
    window.fill({ color: 0x87ceeb });
    window.stroke({ color: 0x654321, width: 4 });
    app.stage.addChild(window);

    // Window panes
    window.moveTo(450, 20);
    window.lineTo(450, 120);
    window.moveTo(350, 70);
    window.lineTo(550, 70);
    window.stroke({ color: 0x654321, width: 2 });

    // Wall lamp
    const lamp = new PIXI.Graphics();
    lamp.roundRect(80, 40, 40, 60, 8);
    lamp.fill({ color: 0xd4a574 });
    lamp.circle(100, 80, 15);
    lamp.fill({ color: 0xfff8dc });
    app.stage.addChild(lamp);

    // Floor with rug
    const floor = new PIXI.Graphics();
    floor.rect(0, 500, 900, 100);
    floor.fill({ color: 0x8b7355 });
    app.stage.addChild(floor);

    // Rug
    const rug = new PIXI.Graphics();
    rug.roundRect(300, 480, 300, 100, 8);
    rug.fill({ color: 0x8b2323 });
    rug.stroke({ color: 0x5c1616, width: 4 });
    app.stage.addChild(rug);

    // Rug pattern
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        rug.rect(320 + j * 65, 495 + i * 25, 50, 20);
        rug.fill({ color: 0x6b1a1a, alpha: 0.3 });
      }
    }

    // Coffee table (behind avatars)
    const table = new PIXI.Graphics();
    table.ellipse(450, 400, 150, 100);
    table.fill({ color: 0x654321 });
    table.stroke({ color: 0x4a2f14, width: 4 });
    app.stage.addChild(table);

    // Table shine
    const shine = new PIXI.Graphics();
    shine.ellipse(400, 370, 60, 30);
    shine.fill({ color: 0x8b6f47, alpha: 0.4 });
    app.stage.addChild(shine);

    // Coffee cups
    drawCoffeeCup(app, 400, 390);
    drawCoffeeCup(app, 500, 390);
  };

  const drawCoffeeCup = (app: PIXI.Application, x: number, y: number) => {
    const cup = new PIXI.Graphics();
    cup.roundRect(x - 15, y, 30, 40, 4);
    cup.fill({ color: 0xf5deb3 });
    cup.stroke({ color: 0x654321, width: 2 });

    // Coffee
    const coffee = new PIXI.Graphics();
    coffee.rect(x - 13, y + 8, 26, 25);
    coffee.fill({ color: 0x3e2723 });

    // Handle
    const handle = new PIXI.Graphics();
    handle.arc(x + 15, y + 15, 8, Math.PI * 1.5, Math.PI * 0.5);
    handle.stroke({ color: 0x654321, width: 2 });

    app.stage.addChild(cup);
    app.stage.addChild(coffee);
    app.stage.addChild(handle);
  };

  const loadAvatars = async (
    app: PIXI.Application,
    bots: Bot[],
    avatars: Avatar[]
  ) => {
    const avatarMap = new Map(avatars.map((a) => [a.bot_id, a]));
    const positions = [
      { x: 250, y: 280 },
      { x: 650, y: 280 },
    ];

    for (let i = 0; i < bots.length && i < 2; i++) {
      const bot = bots[i];
      const avatar = avatarMap.get(bot.id);
      if (!avatar) continue;

      const container = new PIXI.Container();
      container.x = positions[i].x;
      container.y = positions[i].y;

      try {
        // Load avatar layers
        const layers = [
          avatar.base,
          avatar.hair,
          avatar.outfit,
          avatar.accessory,
        ].filter(Boolean);

        for (const layer of layers) {
          const texture = await PIXI.Assets.load(`/avatars/${layer}`);
          const sprite = new PIXI.Sprite(texture);
          sprite.anchor.set(0.5);
          sprite.scale.set(2); // 2x scale for visibility
          container.addChild(sprite);
        }

        // Name tag below avatar
        const nameText = new PIXI.Text({
          text: bot.name,
          style: {
            fontSize: 16,
            fontWeight: 'bold',
            fill: 0x000000,
          },
        });
        nameText.anchor.set(0.5);
        nameText.y = 80;

        const nameBg = new PIXI.Graphics();
        nameBg.roundRect(
          -nameText.width / 2 - 8,
          nameText.y - 12,
          nameText.width + 16,
          24,
          12
        );
        nameBg.fill({ color: 0xffffff });
        nameBg.stroke({ color: 0xd4a574, width: 2 });

        container.addChild(nameBg);
        container.addChild(nameText);

        app.stage.addChild(container);
        avatarSpritesRef.current.set(bot.id, container);
      } catch (error) {
        console.error(`Failed to load avatar for ${bot.name}:`, error);
      }
    }
  };

  const updateSpeechBubble = (
    app: PIXI.Application,
    message: Message,
    bots: Bot[],
    avatarSprites: Map<string, PIXI.Container>
  ) => {
    // Remove old bubble
    if (speechBubbleRef.current) {
      app.stage.removeChild(speechBubbleRef.current);
      speechBubbleRef.current.destroy();
    }

    const botContainer = avatarSprites.get(message.bot_id);
    if (!botContainer) return;

    const bubble = new PIXI.Container();

    // Position bubble above bot
    bubble.x = botContainer.x;
    bubble.y = botContainer.y - 150;

    // Truncate long messages
    const maxLength = 120;
    const displayText =
      message.content.length > maxLength
        ? message.content.slice(0, maxLength) + '...'
        : message.content;

    // Bubble text
    const text = new PIXI.Text({
      text: displayText,
      style: {
        fontSize: 14,
        fill: 0x000000,
        wordWrap: true,
        wordWrapWidth: 250,
      },
    });
    text.anchor.set(0.5, 0);
    text.y = -text.height / 2 - 10;

    // Bubble background
    const bg = new PIXI.Graphics();
    const padding = 15;
    const bgColor = message.teaching ? 0xfff9c4 : 0xffffff;
    const borderColor = message.teaching ? 0xfbc02d : 0x64b5f6;

    bg.roundRect(
      -text.width / 2 - padding,
      text.y - padding,
      text.width + padding * 2,
      text.height + padding * 2,
      12
    );
    bg.fill({ color: bgColor });
    bg.stroke({ color: borderColor, width: 3 });

    // Bubble pointer
    const pointer = new PIXI.Graphics();
    pointer.moveTo(-10, text.y + text.height + padding);
    pointer.lineTo(0, text.y + text.height + padding + 20);
    pointer.lineTo(10, text.y + text.height + padding);
    pointer.fill({ color: bgColor });

    // Round label
    if (message.round) {
      const roundLabel = new PIXI.Text({
        text: `R${message.round}: ${ROUND_NAMES[message.round - 1]}`,
        style: {
          fontSize: 10,
          fontWeight: 'bold',
          fill: 0xffffff,
        },
      });
      roundLabel.anchor.set(0.5);
      roundLabel.y = text.y - 5;

      const labelBg = new PIXI.Graphics();
      labelBg.roundRect(
        -text.width / 2 - padding,
        roundLabel.y - 8,
        text.width + padding * 2,
        16,
        8
      );
      labelBg.fill({ color: borderColor });

      bubble.addChild(labelBg);
      bubble.addChild(roundLabel);
    }

    bubble.addChild(bg);
    bubble.addChild(pointer);
    bubble.addChild(text);

    app.stage.addChild(bubble);
    speechBubbleRef.current = bubble;
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl border-4 border-amber-600 overflow-hidden">
      <div ref={containerRef} className="flex justify-center items-center" />
      {/* Message transcript below */}
      <div className="p-6 bg-gradient-to-b from-white to-amber-50 border-t-2 border-amber-600 max-h-64 overflow-y-auto">
        <h3 className="font-bold text-lg mb-3 text-amber-900">
          Message Transcript
        </h3>
        <div className="space-y-2">
          {visibleMessages.map((msg, idx) => {
            const bot = bots.find((b) => b.id === msg.bot_id);
            const isRoundDivider =
              idx > 0 &&
              msg.round !== visibleMessages[idx - 1].round &&
              msg.round;

            return (
              <div key={msg.id}>
                {isRoundDivider && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-amber-600"></div>
                    <div className="bg-amber-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                      Round {msg.round}: {ROUND_NAMES[msg.round - 1]}
                    </div>
                    <div className="flex-1 h-px bg-amber-600"></div>
                  </div>
                )}
                <div
                  className={`p-3 rounded-lg ${
                    msg.teaching
                      ? 'bg-yellow-100 border-2 border-yellow-400'
                      : 'bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-gray-900">
                      {bot?.name || 'Unknown'}
                    </span>
                    {msg.teaching && (
                      <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded font-semibold">
                        Teaching
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-800">{msg.content}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
