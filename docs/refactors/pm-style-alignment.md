# PM Style Alignment Plan

Status: implemented, 2026-11-27. Typecheck, lint, targeted theme/appearance tests, and a web light/dark smoke check pass; native/Electron visual matrix pending.
Goal: make PM the visual source of truth for Paseo. A Paseo screen and a PM screen use the same surfaces, accent, type scale, control geometry, and states. The embedded PM iframe at `/project-management` stops reading as a second product.

This is visual language alignment, not a page-layout clone. Paseo keeps its own navigation, panes, and screen structure; PM keeps its own pages.

PM keeps ownership of PM pages. Paseo does not reimplement them.

## Scope

In scope:

- Paseo default appearance (`light`, `dark`, `auto`) on iOS, Android, web, and Electron.
- Shared primitives: buttons, fields, menus, dialogs, badges, headers, sidebar rows, composer.
- Paseo's `/project-management` container and its seam with the PM iframe.
- The PM embed contract for scheme, accent, and theme variables when Paseo overrides them.

Out of scope:

- Rewriting PM business pages.
- `packages/website` and marketing surfaces.
- Plugin-contributed themes. They keep their own palettes and are not rebased on PM; the host adapter forwards the active palette to the PM frame.
- Terminal ANSI and syntax themes beyond the surface and cursor colors that flow from the theme.

## Baseline

PM source of truth:

| Concern        | File                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Semantic color | `../project-management-agent-v4/apps/web/src/styles/theme.css`                                                  |
| Accent presets | `../project-management-agent-v4/apps/web/src/features/workspace/preferences.css`                                |
| Base type      | `../project-management-agent-v4/apps/web/src/index.css`                                                         |
| Controls       | `../project-management-agent-v4/packages/ui/src/radix/button.tsx`, `.../badge.module.css`                       |
| Chrome         | `../project-management-agent-v4/apps/web/src/features/pm/pm-shell.module.css`, `.../workspace-shell.module.css` |
| Settings       | `../project-management-agent-v4/apps/web/src/features/agent/src/settings/settings.css`                          |
| Reading        | `../project-management-agent-v4/apps/web/src/features/agent/src/chat/markdown.module.css`                       |

Paseo source of truth today:

| Concern       | File                                                   |
| ------------- | ------------------------------------------------------ |
| Color, type   | `packages/app/src/styles/theme.ts`                     |
| Controls      | `packages/app/src/components/ui/control-geometry.ts`   |
| Button        | `packages/app/src/components/ui/button.tsx`            |
| Settings rows | `packages/app/src/styles/settings.ts`                  |
| Chrome        | `packages/app/src/constants/layout.ts`                 |
| PM container  | `packages/app/src/features/pm-container/index.web.tsx` |

Observed differences that matter:

| Dimension      | PM                                                                    | Paseo today                                               |
| -------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Light surfaces | `#fafaf9` canvas, `#ffffff` content, `#f4f4f2` raised                 | `#ffffff`, `#fafafa`, `#f4f4f5`                           |
| Dark surfaces  | `#111110` canvas, `#181817` content, `#222220` raised                 | `#141716` sidebar, `#181B1A` content, `#1E2120` workspace |
| Accent         | default preference `indigo #4b5bd6`; brand token `terracotta #a6533a` | `#20744A` green                                           |
| Body text      | 14/20 at weight 500                                                   | 14, mostly weight 400                                     |
| Control text   | 13/20 at weight 500                                                   | 14 (or 12) at weight 500                                  |
| Control shape  | 6px radius, 32px pointer / 44px touch                                 | pill radius, 32 / 44                                      |
| Cards          | 12px radius, 1px border, `--surface`                                  | 8px radius, `surface1`                                    |
| Dialogs        | 16px radius, floating shadow                                          | 12px desktop / 16px compact                               |
| Header         | 48px main, 56px business                                              | 36px pointer / 44px touch                                 |
| Sidebar row    | 30px default, 44px touch, 13px label                                  | taller, 14px label, 8px radius                            |
| Reading        | 14/24, inherits 500                                                   | 15/—, normal                                              |

## Decisions

| #   | Decision                | Recommendation                                                                                                         | Why                                                                                                                                              |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Shared accent           | PM's rendered default `indigo` (`#4b5bd6` / `#a8b2ff`).                                                                | It is what PM shows today; PM needs no change. Terracotta stays available as a brand alternate.                                                  |
| D2  | Built-in theme variants | Keep `zinc`, `midnight`, `claude`, `ghostty`, `pureBlack`. The default `light`/`dark` palettes carry the PM alignment. | A saved theme is a user preference, not a second visual language. The defaults match PM; variants stay available and are forwarded to the embed. |
| D3  | Font                    | Keep the platform system stack; do not bundle Inter.                                                                   | The system stack keeps startup and native text unchanged. Size and weight carry the alignment, not a bundled face.                               |
| D4  | Weight                  | 500 for interface text (rows, controls, metadata, badges); 400 for long-form reading.                                  | PM's 500 body weight is the visible signature. A 225-file `Text` retrofit is not worth it; primitives carry the interface weight.                |
| D5  | Header height           | 48px pointer, 56px compact.                                                                                            | Matches PM's `workspace-header-height` and main header.                                                                                          |
| D6  | Composer controls       | 6px rounded controls, 24px composer shell.                                                                             | Matches PM's icon buttons and composer radius. Recompute the composer corner and rail insets.                                                    |
| D7  | Native material parity  | Full token/type/geometry parity; inset glass and edge highlights web/Electron only.                                    | RN cannot render inset shadows cheaply or consistently.                                                                                          |
| D8  | Font-size scaling       | Keep Paseo's interface-size setting; do not scale the PM iframe.                                                       | PM uses px utilities and a fixed 14px root. Scaling the frame would blur or break PM layout.                                                     |

## Token mapping

All values below come from PM's `theme.css`. Accent values are the effective defaults with `data-pm-accent="indigo"`; PM's base `theme.css` declares `#a6533a` / `#de9a7b`, which the preference overrides. If D1 changes to terracotta, substitute the base values and the matching foreground.

| PM variable            | Light                  | Dark                    | Paseo token                                                         |
| ---------------------- | ---------------------- | ----------------------- | ------------------------------------------------------------------- |
| `--background`         | `#fafaf9`              | `#111110`               | `surfaceSidebar`                                                    |
| `--surface`            | `#ffffff`              | `#181817`               | `surface0`, `surfaceWorkspace`                                      |
| `--surface-raised`     | `#f4f4f2`              | `#222220`               | `surface1`                                                          |
| `--surface-hover`      | `#f4f4f2`              | `#222220`               | `surface2`                                                          |
| `--surface-pressed`    | `#eaeae6`              | `#2b2b28`               | `surface3`                                                          |
| derived                | `#dcdcd6`              | `#363632`               | `surface4` (mix pressed toward foreground)                          |
| `--foreground`         | `#232322`              | `#ecece8`               | `foreground`                                                        |
| `--text-secondary`     | `#666660`              | `#b0b0a8`               | `foregroundMuted`                                                   |
| `--text-muted`         | `#6f6f68`              | `#a0a099`               | `foregroundExtraMuted`                                              |
| `--border`             | `rgba(0,0,0,.10)`      | `rgba(255,255,255,.10)` | `border`                                                            |
| `--border-hover`       | `rgba(0,0,0,.18)`      | `rgba(255,255,255,.18)` | `borderAccent`                                                      |
| `--accent`             | `#4b5bd6`              | `#a8b2ff`               | `accent`                                                            |
| `--accent-foreground`  | `#ffffff`              | `#111110`               | `accentForeground`                                                  |
| `--primary`            | `#232322`              | `#ecece8`               | `primary` (legacy alias; PM accent overrides buttons)               |
| `--primary-foreground` | `#fafaf9`              | `#111110`               | `primaryForeground`                                                 |
| `--ring`, `--focus`    | accent                 | accent                  | `ring`                                                              |
| `--success`            | `#15803d`              | `#6ee7a0`               | `statusSuccess`, `success`                                          |
| `--warning`            | `#92400e`              | `#e8c77a`               | `statusWarning`                                                     |
| `--destructive`        | `#b42318`              | `#f0a0a0`               | `statusDanger`, `destructive`                                       |
| `--info`               | `#1d4ed8`              | `#9fc3f0`               | not mirrored; Paseo has no info status token                        |
| `--agent`              | `#6b21a8`              | `#c4a6f0`               | `statusMerged` (Paseo's merged signal uses PM's agent hue)          |
| `--selection`          | accent 9% over surface | accent 14% over surface | object-row selection; sidebar selected keeps `interactionHighlight` |

`accentBright` (`#6b78e0` / `#c4caff`) and `surface4` are Paseo extensions because PM defines no equivalent. Derive `statusSuccessTint`, `statusWarningTint`, and `statusDangerTint` with PM's 8% mix over the current surface. Rebuild `surfaceSidebarHover` and `surfaceSidebarSelected` from the new sidebar color in `derive-colors.ts`.

Keep Paseo's terminal ANSI and syntax palettes. Their background and cursor follow the new `surface0` and `foreground`.

## Typography mapping

PM's roles do not map one-to-one onto Paseo's screen titles. Use the role, not the old token name.

| Role                   | PM                                | Paseo component                                      | Target      |
| ---------------------- | --------------------------------- | ---------------------------------------------------- | ----------- |
| App header title       | 13/20, 500                        | `ScreenTitle`, `CompactHeader`                       | 14/20, 500  |
| Page title             | 20/28, 600                        | settings detail headers, projects, sessions          | 20/28, 600  |
| Content section        | 16/24, 600                        | content page section headings                        | 16/24, 600  |
| Settings section label | 13/20, 500                        | `settingsStyles.sectionHeaderTitle`, `SettingsGroup` | 13/20, 500  |
| Row title              | 14/20, 500                        | `settingsStyles.rowTitle`, sidebar rows, menu items  | 14/20, 500  |
| Metadata               | 12/16, 500                        | hints, timestamps, counts                            | 12/16, 500  |
| Control label          | 13/20, 500                        | `Button`, fields, segmented control                  | 13/20, 500  |
| Body                   | 14/20, 500                        | tool details, forms                                  | 14/20, 500  |
| Reading                | 14/24, 400 (documented deviation) | message body, Markdown, composer input               | 14/24, 400  |
| Code                   | 12/20, mono                       | diff, terminal, code blocks                          | 12/20, mono |

Implementation notes:

- Add `fontSize.control: 13` and explicit `lineHeight` tokens for each role. Paseo currently defines only `lineHeight.diff`.
- Set the default `contentFontSize` to 14. Keep the setting range; users can still raise it.
- Use `fontWeight.medium` for interface roles. Do not set a global `Text` default; 225 files import `Text` from `react-native`.
- Page titles need a primitive. Do not turn `ScreenTitle` into a 20px title; it is app chrome, not page content.

## Geometry and material mapping

| Element        | PM                                                | Paseo change                                                                                    |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Button         | 32/44 high, 6px radius, px-3, min-w-16, 13/20     | `buttonSm`/`buttonMd` radius `full` → `md` (6); padding 16 → 12; add minWidth 64; label 14 → 13 |
| Icon button    | 32/44 square, 6px radius                          | Icon-only buttons stay square; radius `full` → `md`; touch stays 44                             |
| Field          | 32/44 high, 6px radius, 13/20                     | field radius `lg` (8) → `md` (6); text 14 → 13                                                  |
| Card           | 12px radius, `--surface`, 1px border, edge shadow | `settingsStyles.card` radius `lg` → `xl`; background `surface1` → `surface0`; keep border       |
| Popover / menu | 8px radius, `--surface`, floating shadow          | Keep radius `lg` (8); add the border/shadow treatment                                           |
| Dialog / sheet | 16px radius, `--surface`, floating shadow         | desktop `xl` (12) → `2xl` (16); keep compact 16                                                 |
| Header         | 48px main, 56px business                          | `BAR_HEIGHT` pointer 36 → 48; compact 44 → 56                                                   |
| Sidebar row    | 30px default, 44px touch, 6px radius, 13px        | row height and radius from `density`; label 14 → 13; radius `lg` → `md`                         |
| Status badge   | 6px default, 12/16                                | `StatusBadge` radius `full` → `md`                                                              |
| Composer       | 24px shell, 6px controls, 32/44 high              | composer corner 16 pointer → 24; controls 6px; recompute `DISC_CORNER_NEST`                     |
| Disabled       | opacity 45%                                       | 50% → 45%                                                                                       |
| Focus          | 2px accent ring, offset 2                         | Keep 2px; map color to PM `--focus`                                                             |

Material rules:

- Web and Electron: 1px border plus PM's edge/control shadows on cards and floating layers. Use PM's `--edge-shadow` and `--shadow-floating` recipes. Pane headers do not float.
- iOS and Android: 1px border and the same palette; use the existing RN `shadow` tokens for floating layers. Do not fake inset highlights.
- Rows and long lists never get shadows.

## Work breakdown

Each phase is a separate PR. Do not mix palette, type, and geometry in one review.

### P0 — Visual spike (1–2 days)

- Branch only, not shipped.
- Rebase `light`/`dark` to the PM palette, set button/field radius to 6, headers to 48, and type weights to the target.
- Screenshot: settings root, settings detail, sidebar, agent chat + composer, projects list, PM embed.
- Compare against PM at the same viewport in light and dark.
- Decision gate: D1 accent, D6 composer, D7 native material. If the spike does not read as one product, stop before P1.

### P1 — Token source and palette (1–2 days)

- Add `scripts/pm/sync-theme-tokens.mjs` and a committed `packages/app/src/styles/pm-tokens.gen.ts`, following `scripts/pm/sync-contract.mjs`. The script reads PM's `theme.css`, `preferences.css`, and `index.css`; `--check` fails on drift when the PM checkout exists. Normal CI must not require the sibling.
- Rebase `buildLightSemanticColors` / `buildDarkSemanticColors` inputs in `theme.ts` on the generated values.
- Keep `light`, `dark`, and `auto` names so adaptive themes keep working.
- Update `theme-contrast.test.ts` and `theme.test.ts` expectations.
- Acceptance: token values match the generated file; contrast floors pass; screenshots show color-only changes.

### P2 — Typography (2–3 days)

- Add control/line-height tokens; set content default 14.
- Update `ScreenTitle`, `settingsStyles.sectionHeaderTitle`/`rowTitle`, `Button` label, fields, `StatusBadge`, menu items, page titles.
- Acceptance: no interface text below 12; page titles 20/28 600; controls 13/20 500; no compact overflow.

### P3 — Controls and surfaces (3–4 days)

- `control-geometry.ts`: button/field radii, padding, min width, icon button shape, disabled opacity.
- `button.tsx`: variants mapped to PM (`secondary` = surface + border, `outline` = surface + border, `ghost` transparent).
- `settings.ts`: card radius 12, surface background, row weight 500.
- Menus and `AdaptiveModalSheet`: radius, border, shadow.
- `StatusBadge`: rounded 6 by default.
- Acceptance: a component gallery page or Storybook-style screen matches PM's primitives in both schemes.

### P4 — Chrome, navigation, composer (3–4 days)

- `constants/layout.ts`: header heights 48/56.
- Sidebar rows: height, radius, label size, selected fill.
- Composer: 24px shell, 6px controls, recompute `COMPOSER_CORNER_RADIUS`, `DISC_CORNER_NEST`, and toolbar gaps.
- Acceptance: sidebar, chat, tabs, terminal, explorer, and composer screenshots at 1440, 1024, and 390 widths; no layout shift as state changes.

### P5 — PM embed seam (1–2 days)

- Paseo container toolbar: 48px, icon buttons 6px, background/border matching PM; remove the duplicate title if PM's header already names the page.
- Same-origin adapter in the container sets the frame document's scheme and PM's CSS variables on `documentElement` on `pm:ready` and on appearance changes. Forward the scheme, accent, theme variant, and the surface, status, radius, and type variables PM already reads. Do not write PM's `pm.display-preferences.v1`.
- Set the iframe background from the host surface before PM mounts, so the first paint does not flash white.
- No `pm:theme` message and no PM-side handler. PM keeps its own theme when it runs standalone; the adapter changes nothing in the PM repository.
- Acceptance: forcing Paseo dark while the OS is light renders a dark PM frame without a light flash; `/project-management` screenshots in both schemes.

### P6 — Docs, QA, cleanup (2–3 days)

- Rewrite `docs/design.md` sections that this changes: tokens, character, hierarchy, buttons, borders, density, forbidden. State that PM is the source of truth.
- Add a visual contract section to `docs/pm-integration.md` linking this plan.
- Add QA evidence under `docs/qa-evidence/pm-style/` (pending).
- Keep built-in theme variants; there is no preference migration.
- Acceptance: docs match code; no `COMPAT`-style leftovers; `rg "borderRadius.full"` on buttons and fields returns nothing.

Estimated total: 13–20 engineer-days, roughly 3–4 weeks elapsed for one engineer including platform QA. The estimate excludes PM-side changes if D1 becomes terracotta.

## Verification

Not run yet. Run after each PR:

```bash
npm run typecheck
npm run lint
npx vitest run packages/app/src/styles/theme-contrast.test.ts packages/app/src/styles/theme.test.ts packages/app/src/appearance/apply.test.ts --bail=1
npm run format:files -- <changed files>
```

Visual matrix (pending):

| Surface                | Web | Electron | iOS | Android |
| ---------------------- | --- | -------- | --- | ------- |
| Settings root/detail   | yes | yes      | yes | yes     |
| Sidebar + agent list   | yes | yes      | yes | yes     |
| Chat + composer        | yes | yes      | yes | yes     |
| Projects list/detail   | yes | yes      | yes | yes     |
| Menus, dialogs, sheets | yes | yes      | yes | yes     |
| Terminal + diff        | yes | yes      | yes | yes     |
| `/project-management`  | yes | yes      | n/a | n/a     |

Check in both schemes: light and dark. Check 1440×900, 1024×768, and 390×844. Check focus rings, disabled states, reduced motion, and touch targets.

## Risks

| Risk                                | Mitigation                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Accent change reads as a rebrand    | P0 spike and sign-off before P1; update website separately.                      |
| Global weight 500 hurts reading     | Keep 400 for long-form reading; apply 500 through primitives only.               |
| Bundled font increases size/startup | Not applicable: D3 keeps the system stack and bundles no font.                   |
| Header/radius changes reflow UI     | Phase the changes; screenshot matrix per PR; no mixed phases.                    |
| Alternate themes drift from PM      | Built-in variants stay as saved preferences; plugin themes documented as exempt. |
| PM token drift after this work      | Generated token file plus `--check`; PM remains the source.                      |
| Native cannot match glass edges     | D7 parity level; borders only on native.                                         |
| Font-size setting cannot reach PM   | Documented limit; do not scale the iframe.                                       |

## Definition of done

- Default `light` and `dark` token values match PM's generated tokens.
- Buttons, fields, cards, menus, dialogs, headers, sidebar rows, badges, and composer match the PM geometry and type roles.
- `/project-management` follows Paseo's scheme and accent with no flash.
- `docs/design.md` and `docs/pm-integration.md` describe the new contract.
- Typecheck, lint, and targeted theme/appearance tests pass; web light/dark smoke passes. Native/Electron visual matrix pending.
- Web smoke evidence is in `docs/qa-evidence/pm-style/` (settings light/dark, PM container dark).
