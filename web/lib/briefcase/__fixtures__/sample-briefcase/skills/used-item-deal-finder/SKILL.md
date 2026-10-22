---
name: Used-item deal finder
description: >-
  Use this when someone wants recurring searches of Facebook Marketplace and/or
  Craigslist for underpriced used items (any category) near a location, with hit
  alerts and a top-3 board.
---
# Used-item deal finder

A reusable recipe for hunting underpriced used items. Fill in the PARAMETERS, then run it on a schedule (usually as a routine, 1–2x a day).

## Parameters (set per hunt)
- Item and search queries (e.g. "gaming computer", "computer").
- Home location (city/ZIP, Marketplace location ID), radius (e.g. 100 mi), price range.
- Minimum spec screen (what makes a listing worth pricing).
- Hit threshold (e.g. at least 20% below the new-parts or new-retail price).
- Where alerts go (chat, and/or an email address from the bot's own mailbox).
- A state folder, e.g. /workspace/<hunt>-deals/ holding seen.json and top3.json.

## Facebook Marketplace (browser, signed-in account)
1. Browse through a desktop/browser subagent at human pace. Stop and report once on any checkpoint, captcha or lock.
2. Search with Marketplace's own search box, or with /marketplace/<locationId>/search/?query=<q>&radius=<mi>&maxPrice=<max>. Don't add daysSinceListed or sortBy, because they make Facebook ignore the query. Confirm the results actually match the item.
3. Scroll about 8 pages per query.

## Craigslist (no browser, read-only)
1. Use the public JSON search: https://sapi.craigslist.org/web/v8/postings/search/full?searchPath=<cat>&query=<q>&sort=date&batch=1-0-360-1-0&lang=en&cc=us&postal=<zip>&search_distance=<mi>&min_price=<min>&max_price=<max>, with a Referer for the region.
2. Cover every region inside the radius. Compute the real distance from each post's lat/lon, because the API pads results with far-away posts.
3. Stay under 1 request per second and stop on persistent 403s. Never post, reply, flag or contact sellers.

## Don't redo work
- Keep seen.json (id, title, price, screen result, verdict, time). Skip known ids unless the price dropped, and re-price drops.
- Open only new listings that could plausibly pass the screen.

## Screen, price, verdict
1. Quick screen against the minimum spec. Missing specs go on a maybes list. Flag scams (price far below used value, one photo, pressure).
2. Price the parts or item NEW from real current sources (retailers, review sites, price trackers). Mark estimates as estimates.
3. A HIT clears the threshold. Report the % below new, how it compares with used value (above it is a weak hit), the distance, red flags and confidence.

## Top 3 board
- Keep top3.json as the 3 best live deals. Re-check those each run, drop sold or removed ones, backfill from seen.json, and let new hits outrank.
- Show the board at the bottom of every alert.

## Notify
- Only on a new hit, a new top-3 entry, or a big price drop. Otherwise stay quiet.
- Keep alerts short: title, price, town and miles, key specs, new value, % below, flags, link.
- Send email only from the bot's own mailbox, as the owner's standing routine allows. Type long bodies in chunks and verify the first and last lines.

## Shutting a hunt down
When the item is bought, pause the routines and keep the state folder for reference.

## Worked example
See EXAMPLE.md in this folder: a real 2026 used gaming PC hunt, with its settings, results, top-3 board and lessons learned.
