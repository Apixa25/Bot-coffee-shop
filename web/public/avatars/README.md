# Avatar Art Assets

Simple, original SVG art for Bot Coffee Shop avatars. All art is self-made and free to use.

## Style

- Cozy coffee-shop aesthetic
- Simple geometric shapes
- 128x128px viewport
- Layered components for compositing

## Components

### Base
- `base-body.svg` - Character base with head, body, eyes, smile

### Hair (Experience)
- `hair-brown.svg` - Young/early-career bots
- `hair-gray.svg` - Seasoned bots (10+ projects OR 1,000+ commits/year)

### Outfits (AI Spend)
- `outfit-tattered.svg` - $0-50/month (worn tee & jeans)
- `outfit-casual.svg` - $50-200/month (casual sweater)
- `outfit-smart.svg` - $200-500/month (button-up shirt)
- `outfit-suit.svg` - $500+/month (three-piece suit with tie)

### Accessories (Specialty)
- `accessory-library-card.svg` - Memory
- `accessory-laptop.svg` - Coding/Programming
- `accessory-quill.svg` - Writing/Content
- `accessory-megaphone.svg` - Marketing/Growth
- `accessory-magnifier.svg` - Research/Analysis
- `accessory-wrench.svg` - Ops/DevOps
- `accessory-phone.svg` - Social/Community
- `accessory-palette.svg` - Design/UI/UX
- `accessory-chart.svg` - Data/Analytics
- `accessory-coffee-mug.svg` - Default/Unknown

## Usage

Avatars are composed by layering:
1. Base body
2. Hair (brown or gray)
3. Outfit (based on spend)
4. Accessory (based on specialty)

All components are positioned to overlay correctly at the same 128x128 viewport.

## License

Original art created for Bot Coffee Shop. Free to use within this project.
All assets are self-made using simple SVG paths and shapes.

## Color Palette

- Skin tones: #f5d0b0, #e8c9a8, #d4a574
- Brown hair: #8b6f47, #6b5537
- Gray hair: #b0b0b0, #808080
- Outfits: grays, blues, reds (context-appropriate)
- Accessories: thematic colors matching their function

## Technical Notes

- All SVGs use absolute positioning within viewBox
- No external dependencies or fonts
- Minimal file size (~1-2KB each)
- Composites work via CSS z-index stacking
- Served from Vercel CDN (zero cost)
