# Design

## Source of truth
Active, 2026-11-04. User selected the existing `site/sian-a.html` (평양 객장) and requested polish for the wall message, price strip, borders, top controls, average-price panel and character labels. `site/index.html` is the applied version. A/B preview files and original `source/online.html` remain reference snapshots. Evidence: supplied screenshot, A preview captured at 1440×1000, existing canvas/Three.js and DOM code.

## Brand
A playful crimson trading hall with warm brass details and burgundy control surfaces. Keep the approved A room, furniture and character style. A restrained architectural trim and rectangular control badges replace the mixture of thick frames and pill-shaped boxes.

## Product goals
Readable live-price comparisons, a distinctive room identity, and clear personal average-price entry. No market calculation, endpoint, trading, account, chat protocol or storage-schema changes. Temporarily hide the local hipster NPC using an explicit visibility switch.

## Personas and jobs
Visitors watch BTC/ETH charts, compare domestic quotes and premiums, move or sit in the room, and optionally display their personal average price above their character.

## Information architecture
Upper left: brand, exit and existing room state. Upper right: average-price entry. Front wall: playful motto, stationary five-part quote rail, BTC/ETH charts. Average-price dialog retains the original market-source explanation under 시세 기준. Bottom chat and movement guidance preserve their behavior.

## Design principles
Preserve A as one direction. One quiet brass border treatment for scene and controls. Reduce competing outlines rather than add decoration. All prices and statuses remain real or explicitly unavailable; no fixture data enters production.

## Visual language
Crimson room and dark marble from A; near-black burgundy boards; ivory labels; muted brass separators. Korean UI font for small ticker text, LED font for large main-board numbers. Compact 10–14px rectangular HUD corners; matching rectangular name/average-price plates. Stationary quotes remove cut-off moving text and retain all five metrics.

## Components
Existing IDs and events remain contracts. `site/ui-a.css` styles the HUD and panels; Three.js scene and canvas textures remain in `site/index.html`. Theme values live in existing CSS variables and THEME/COL. No dependency or asset additions.

## Accessibility
Keyboard focus, form labels, Escape and outside dismissal, adequate touch targets, reduced motion, bounded small-screen popovers. Decorative scene remains represented by its existing canvas label; market-source text is accessible in the average-price panel. Do not communicate price direction only by hue.

## Responsive behavior
Verify at 320/375/768/1440px; brand and average button must not overlap. Popover fits beneath HUD and scrolls if needed. Preserve existing camera adaptation, touch movement and safe-area treatment.

## Interaction states
Keep average-price empty/invalid/saved/cleared states, persistence and floor-unit conversion. Existing market-loading and solo/disconnected states remain. The chat server may reject this mirror's origin; redesign must not represent that as a working live chat.

## Content voice
Short Korean. The wall motto is playful: 동지여, 차트는 흔들려도 멘탈은 사수하라! Keep factual market provenance in secondary information. No promised returns or fabricated activity.

## Implementation constraints
Static HTML, local Three.js r128 and local fonts. Preserve original server routes, storage keys, movement, chart calculations and average-price validation. Test with isolated browser storage and inert WebSocket so verification never sends messages/state to other users. Use mock market responses only in tests. Preserve user-authored A/B previews.

## Open questions
- [ ] Re-enable the hipster when requested; owner: user, default SHOW_HIPSTER=false.

### Verification
Inline JavaScript syntax and local asset paths passed. Existing market calculation, average-price validation, and networking/persistence sections were compared with A and remain unchanged. Isolated browser checks cover invalid values, formatting, BTC/ETH saves, reload persistence, clearing, Escape/outside/close behavior and WebGL rendering. Header/popover bounds passed at 320/375/768/1440px. These tests stub WebSocket traffic and do not establish live chat connectivity.
