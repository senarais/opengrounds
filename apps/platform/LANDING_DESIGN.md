# Open Grounds landing

## Direction

English Platform home only. Centered "Open Grounds." wordmark on an orange mesh
and directional flow field, sand-like grain, generous court photography,
asymmetric content, and simple primary actions. The product is participation in
distributable net profit, not ownership of a court, land, or the owner's company.

Regular: navigation → centered mesh/flow hero → two-column introduction and court
photo → black curved gallery → four-step process → live listings → pale-orange
owner pathway → FAQ → orange closing → black footer/disclosures.

Compact: same content/order, stacked columns, accessible expandable navigation,
two-column process (one below 540px), full-width photography, native FAQ disclosures.

## Reference analysis

- [Rana Grounds](https://ranagrounds.id/): Elementor/Hello theme, Futura PT and
  Futura PT Condensed italic display text, green/coral block sections, wide facility
  photography. HTML settings specify `fadeInDown` entrances with 600/1200/1800ms
  delays. Adaptation: strong sports typography and photo-led section rhythm;
  shorter, optional entrances so reading does not wait on decoration.
- [Alsager Padel](https://alsagerpadel.co.uk/): custom WordPress theme, Gravita Hum
  variable font, navy/lime/blue, generous white space, bold headings, slightly
  rotated highlight backgrounds and button layers. Custom JS bundles GSAP with
  scroll-triggered text/section transitions; CSS button transitions are 300ms.
  Adaptation: editorial hierarchy, tilted headline highlight, airy two-column
  stories and restrained hover/reveal motion, using Open Grounds colors.
- [React Bits AnimatedContent](https://reactbits.dev/animations/animated-content)
  was inspected alongside its TypeScript source. Its GSAP/ScrollTrigger dependency
  is unnecessary for these one-time entrances: IntersectionObserver + CSS handles
  them. No React Bits source is included: the supplied canvas and sliced-cylinder
  components cover the requested motion without GSAP or an extra animation runtime.

## Hero revision

The user's 21st.dev Shader Builder "Mesh drift" recipe supplies four moving
Gaussian color fields. Active palette is Sunrise orange, white-softened orange,
and white; inactive OKLab, blur, warp, and cursor modes are omitted. Film grain
uses the supplied Dave Hoskins `hash12` implementation.

The supplied FluidFlowGrid is adapted as a transparent Canvas 2D layer over the
mesh. Orange/black strokes replace blue, the OS color scheme does not change the
palette, and field size follows the hero rather than the window. Masks keep the
flow at the edges, away from body copy. Photography now supports the introduction
instead of competing with the centered hero.

Both renderers use `useCanvasAnimation`: 30fps, DPR capped at 1.5, at most
1,200,000 pixels per layer, ResizeObserver sizing, off-screen/hidden-tab suspension,
pause/resume, and live reduced-motion changes. Elapsed time freezes while paused.
The WebGL renderer validates shader compilation/linking, releases its resources,
and defers context release across Strict Mode remounts. An orange CSS poster
remains readable before hydration or when WebGL is unavailable/lost.

`landing-grain.svg` adds static, tiled fractal grain to paper, orange, and black
surfaces. Its maximum black alpha is 12%, so texture does not sacrifice readability.

## Navigation revision

References inspected in source:

- [The Hoxton](https://thehoxton.com/): fixed, transparent header over the opening
  media, with a distinct booking CTA. This supplies the overlay hierarchy.
- [Rana Grounds sticky-header CSS](https://ranagrounds.id/wp-content/plugins/sticky-header-effects-for-elementor/assets/css/she-header-style.css):
  `.she-header-transparent-yes` uses a transparent overlay; the sticky header
  transitions background and border colors over 400ms. Open Grounds adapts this
  to a shorter 220ms surface transition.

The landing header overlays the orange hero at the top, then becomes opaque white
after approximately 16px of scroll. A 1px IntersectionObserver sentinel drives
state changes without a per-scroll render loop. Header height is fixed at 88px
(74px on compact screens); only background/shadow change, preventing layout jumps.
The hero extends behind it, and flow marks are masked away from navigation text.

An open mobile menu always has a white surface. Its panel overlays content rather
than pushing the hero, is scrollable on short screens, closes on Escape with focus
returned to the trigger, and closes when switching to desktop width. Scroll state
is re-read when returning to the landing. Reduced-motion disables the transition;
reduced-transparency or increased-contrast preferences keep the header opaque.

Apple's `materials.md › Liquid Glass` supplied the principle of a distinct,
legible functional layer over content; the web implementation uses opaque white
after scroll rather than requiring blur/translucency.

## Tokens and accessibility

Reuse Plus Jakarta Sans (display) and Inter (body) from the existing system.
Desktop scale: 160px maximum hero, 58px section headings, 23px subheads, 16px body.
Compact hero: 56–104px; body: 15–16px. Primary controls are at least 44px tall.

Landing-only colors: carbon `#171717` (content and black sections), neutral
`#55524F` (secondary content), paper `#FAF9F6`, Sunrise `#FF7A00`, and orange
lightened with white (`#FFC99A`, `#FFE4CC`). Existing shared fonts and logo stay
the brand anchors. Palette follows the requested white/black/orange direction.
Calculated contrasts before texture: carbon/Sunrise 6.86:1, secondary/paper 7.37:1,
paper/carbon 17.03:1, secondary on black (`#C4C1BB`) 9.98:1. Carbon against the
darkest theoretical orange mesh plus film grain and 12% black texture is 5.00:1.

Applied Apple design references: `typography.md › Conveying hierarchy` (few
typefaces, distinct hierarchy), `branding.md › Best practices` (accent used
judiciously), `motion.md › Best practices` (purposeful, optional motion),
`accessibility.md › Vision` (contrast, text enlargement, keyboard access).
These are web design principles, not iOS navigation conventions.

The gallery has a pause/resume action, stops when outside the viewport, and
preserves its composed still image under `prefers-reduced-motion`. Entrances
also respect that preference. No scroll hijacking, countdowns, fake stats, or
fictional active listings. Market rows use actual Active series only.

## Component integration

Next.js App Router and strict TypeScript already exist. `@/*` resolves to the
Platform app root. Reusable gallery lives in `apps/platform/components/ui`,
with native scoped CSS replacing the prompt's Tailwind classes and `cn` helper.
No shadcn or Tailwind setup is needed for this integration. The component's
geometry is adapted from the supplied brief, with observer cleanup, lazy images,
viewport pausing, explicit pause state, and an empty-image guard.

Landing shell is selected by pathname, leaving existing route layouts available.
Styles use `og-` and `tgh-` prefixes. Existing Privy context and role-based
dashboard access remain in the shared layout.

## Image sources

Local downloads; not hotlinked. Next Image optimizes the hero and owner photos;
gallery facets share optimized sources generated by `getImageProps` and cached
by the browser. Images are illustrative and never
evidence of a listed venue or an affiliation.

| Local file | Original source |
| --- | --- |
| `landing-player.jpg` | https://images.unsplash.com/photo-1554068865-24cecd4e34b8 |
| `landing-tennis.jpg` | https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0 |
| `landing-basketball.jpg` | https://images.unsplash.com/photo-1546519638-68e109498ffc |
| `landing-football.jpg` | https://ranagrounds.id/wp-content/uploads/2026/06/parigi_bg.jpg |
| `landing-padel.jpg` | https://alsagerpadel.co.uk/wp-content/uploads/2026/03/image0-scaled.jpeg |

Reference-site photos remain the respective owners' work; attribution does not
grant reuse rights. This demo labels and credits them. Secure permission or
replace them with licensed photography before a public production release.

## Verification

`pnpm --filter @venue-rwa/platform typecheck`

`pnpm --filter @venue-rwa/platform exec vitest run test/tilted-grid.test.ts`

`NEXT_DIST_DIR=.next-build NODE_OPTIONS="--max-old-space-size=1536" pnpm --filter @venue-rwa/platform exec next build --webpack`

Runnable motion check (server running): `node apps/platform/scripts/check-landing-motion.mjs`.
It uses externally installed Playwright. Set `PLAYWRIGHT_MODULE` to its module path
and optionally `CHROMIUM_PATH` to an existing Chromium executable. `LANDING_URL`
defaults to `http://localhost:3000`. The check observes actual draw calls rather
than inferring animation from styles.

Browser checks: 320/390/768/1440px, 200% text, FAQ keyboard interaction, menu
Escape/close, English copy, valid local images, gallery and background pause/resume,
reduced-motion, off-screen rendering suspension, bounded canvas size, WebGL
fallback/context loss, transparent/white header states without layout shifts,
mobile-menu resizing, legacy route navigation, and axe accessibility scan.
