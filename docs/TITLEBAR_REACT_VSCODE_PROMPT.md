# Titlebar React Implementation Prompt (VS Code-oriented)

Goal: implement a VS Code-like custom titlebar behavior in React without ad-hoc hacks.

## Non-negotiable constraints

1. Use strict three-zone layout: `left / center / right`.
2. No visual overlap between zones in any resize state.
3. Keep app icon and top-level menu host in a stable left zone.
4. Keep account/settings in a stable right zone, directly before a dedicated window-controls spacer.
5. Center search stays centered, has default visual width 600px, and can shrink to 0 by layout (no hard min width).
6. Use one source of truth for reserved window-controls width.

## Architecture to implement

### 1) Layout model (in CSS)
- Root titlebar is a flex row with three children.
- `left` and `right` are flexible side zones.
- `center` is middle zone with max width 600px and shrink enabled.
- Do not use absolute positioning for center.
- Keep drag region on root and no-drag on interactive controls.

### 2) Window controls reserve
- In React, compute `windowControlsReservePx` once and on resize/geometrychange.
- Apply it as CSS variable on root (`--window-controls-width`).
- Render an explicit spacer element in right zone using that width.
- Account/settings must be placed immediately before spacer.

### 3) Menubar overflow
- Compute overflow only from measured available menu width in left zone:
  - `available = leftWidth - appIconWidth - gaps`.
- Keep stable `More` slot width in calculation.
- Use hysteresis when expanding back from compact to avoid flicker.
- No center width subtraction in overflow logic.

### 4) Search behavior
- Search row uses layout only:
  - width 100% inside center zone
  - search field default 600 cap
  - min-width 0 and flex-shrink enabled
- No JS width assignment for search field.

### 5) Validation checklist
- App icon and menu button never overlapped by arrows/search.
- Settings/account always visible on right near window controls.
- Window controls never overlap titlebar widgets.
- Search remains centered and shrinks smoothly on narrow windows.
- Menubar items collapse progressively into More with no lateral jumps.

