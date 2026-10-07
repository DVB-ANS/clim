# Third-party notices

clim's front uses or adapts the third-party code below. Every adapted file starts with a header naming
its source. The components are used inside this application only: they are not sold, sublicensed or
redistributed as a component library, a kit or a template.

The license text of every npm package in the site's dependencies, permissive ones included, is in
`public/third-party-licenses.txt` (served at [/third-party-licenses.txt](https://clim-zeta.vercel.app/third-party-licenses.txt);
`npm run licenses` regenerates it). The sections below cover the code, data and fonts clim copies or adapts
whose licenses require a notice, and the npm packages with non-permissive terms.

Patterns re-implemented with no code copied, so with no notice below (their files' headers still name them):
Dither it! (`src/components/site/LcdStorm.tsx`, `scripts/make-dither.mjs`) and Aceternity UI
(`src/components/site/PointerHighlight.tsx`, `src/components/site/FloatingNav.tsx`).

## ua-parser-js

- Package: [`ua-parser-js`](https://github.com/faisalman/ua-parser-js) 2.0.10, unmodified. It is an npm dependency of `@rainbow-me/rainbowkit` 2.2.11, which calls it to detect the browser and operating system in its wallet modal, and it is bundled into the site's JavaScript.
- License: GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later), Copyright © 2012-2026 Faisal Salman (`node_modules/ua-parser-js/LICENSE.md`; full text at https://www.gnu.org/licenses/agpl-3.0.html).
- Source: the library's source is at https://github.com/faisalman/ua-parser-js (version 2.0.10). The source of this application, which bundles it, is public at https://github.com/DVB-ANS/clim (`app/`); `app/package-lock.json` pins the exact version.

## MetaMask SDK

- Packages: `@metamask/sdk` 0.33.1, with `@metamask/sdk-communication-layer` 0.33.1 and `@metamask/sdk-install-modal-web` 0.32.1, unmodified. wagmi's MetaMask connector (`@wagmi/connectors` 6.2.0, through wagmi 2.19.5 and RainbowKit 2.2.11) references it, so it is part of the site's build as a lazily loaded chunk. clim's wallet list does not use that connector (`src/lib/wallet.ts`): MetaMask is offered as an installed wallet (EIP-6963) or through the browser's injected provider, so a visitor's browser does not load the SDK.
- Notice: the MetaMask SDK is used in this application and is the copyright of ConsenSys Software Inc. ("Copyright ConsenSys Software Inc. 2022. All rights reserved."). It is used under the license shipped with each package (`node_modules/@metamask/sdk/LICENSE`). That license allows Non-Commercial Use only (as it defines it: personal or hobby use with no anticipated commercial application, use by a charitable, educational, research, public-safety, environmental or government body, or a program with no more than 10,000 monthly active users) and sets two conditions: (1) a prominent notice, with each copy of the Resulting Program (any program that combines the SDK; here, the site's built JavaScript), that the SDK is used in it and is the copyright of ConsenSys; and (2) the Resulting Program, and any distribution, copy, modification or combination of it, stays under the same notice requirement and the same Non-Commercial Use restriction. This section is that notice. clim is a hackathon demo with no commercial use. clim's own source code stays under the MIT license; the restriction attaches to the built site, which combines the SDK.

## React Bits

[React Bits](https://reactbits.dev), github.com/DavidHDev/react-bits. License (LICENSE.md at the repository root):

```
MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### StatusMark

- **Source:** https://github.com/DavidHDev/react-bits/blob/main/src/ts-tailwind/Micro/StatusMark/StatusMark.tsx
- **Page:** https://reactbits.dev/micro/status-mark
- **Version:** main branch, TS + Tailwind variant. No commit was pinned; the registry item is https://reactbits.dev/r/StatusMark-TS-TW.json.
- **License:** MIT + Commons Clause License Condition v1.0. Copyright (c) 2026 David Haz. It is used as part of this application only and is not sold, sublicensed or redistributed as a component.
- **File:** `src/components/StatusMark.tsx`.

**What was adapted:**
- The `react-hooks/refs` error was fixed. The geometry ref is now written in `useLayoutEffect`, not during render. `writeDash` was moved to a module-level helper, and the hook dependency lists were completed, which removed the `eslint-disable` comments.
- Default colours now come from clim tokens: `var(--clim-fg-muted)`, `var(--clim-normal)` and `var(--clim-danger)` replace `currentColor`, `#22c55e` and `#ef4444`.
- `strike` defaults to false and `size` defaults to 16.
- The keyframes `<style>` tag uses React 19's `href` and `precedence` props, so there is one shared sheet instead of one per instance.
- It was converted to clim's code style: a named function export, double quotes and `cn()`.
- Used in `src/components/TxSteps.tsx`, where it replaces the ○◔◑●✕ glyphs, and in `src/components/PnlPanel.tsx`, as the check mark when the two average fees are within 10% of each other.

### Magnet

- Source: https://reactbits.dev/animations/magnet (https://github.com/DavidHDev/react-bits/blob/main/src/ts-tailwind/Animations/Magnet/Magnet.tsx), main branch, no pinned commit
- License: MIT + Commons Clause License Condition v1.0. Copyright (c) 2026 David Haz.
- Used as part of this application only; not sold, sublicensed or redistributed as a component.
- Adapted in `src/components/site/Magnet.tsx`:
  - Rewritten on motion (`useMotionValue` + `useSpring` 150/15) in place of React state and CSS transitions.
  - A passive `pointermove` listener in place of `mousemove`.
  - The pull is measured from the laid-out box.
  - Off under reduced motion and on coarse pointers.
  - One inline-block `motion.span` wrapper with no prop or style spread.
  - Defaults are padding 40 and strength 6.

## Rare UI

[Rare UI](https://rareui.com), github.com/swamimalode07/rare-ui, at commit 539567414bac024260ed696c9647c737380514a7 (2026-09-21), the
last commit before Rare UI's 2026-09-22 terms: f64e5833 added non-commercial usage rules to the site and 32b7b52a changed the
LICENSE to MIT + Commons Clause + Attribution; neither applies to these copies, and the three files are byte-identical at all
three commits and on main. License in force at that commit:

```
MIT License

Copyright (c) 2026 Swami Malode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Animated Counter

- Source: [Rare UI](https://rareui.com) "Animated Counter", https://github.com/swamimalode07/rare-ui/blob/539567414bac024260ed696c9647c737380514a7/components/ui/animated-counter.tsx (commit 53956741, 2026-09-21, before Rare UI's 2026-09-22 terms; this file is byte-identical on main).
- Adapted in: `src/components/AnimatedCounter.tsx`.
- Changes:
  - The `cn` import now points to `@/lib/cn`.
  - The two `#000` stops in the mask gradient are now `rgba(0,0,0,1)`, which is the same alpha.
  - Added a license header and doc comments on the exports.
- License: MIT License, Copyright (c) 2026 Swami Malode. This is the license in force at commit 53956741. Rare UI's later license (MIT + Commons Clause + Attribution, from commit 32b7b52a) does not apply to this copy.

### Gooey Nav

- Source: [Rare UI](https://rareui.com), [github.com/swamimalode07/rare-ui](https://github.com/swamimalode07/rare-ui), file `components/ui/gooey-nav.tsx` at commit [`539567414bac024260ed696c9647c737380514a7`](https://github.com/swamimalode07/rare-ui/blob/539567414bac024260ed696c9647c737380514a7/components/ui/gooey-nav.tsx). This is the last commit before Rare UI's 2026-09-22 terms; the file is byte-identical on main.
- License: MIT License, Copyright (c) 2026 Swami Malode (the LICENSE file in force at that commit).
- Adapted in `src/components/GooeyNav.tsx`, used by `src/components/AppHeader.tsx`. Changes:
  - The hard-coded hex colours became clim tokens: the bar is surface-2, and the neck currentColor (BAR_TEXT) matches it. Inactive labels use fg-muted. Active is `var(--clim-accent)` with a `var(--clim-accent-fg)` label.
  - The gradient stops take their colour through the `stop-color` CSS property (style), so var() resolves.
  - The `dark:` classes were removed.
  - Labels use the regular weight.
  - The 400 ms colour fade turns off under reduced motion.
  - The list scrolls horizontally with a hidden scrollbar, and the active tile is scrolled into view.
  - Added a keyboard focus ring and a hover colour.
  - A modified click (new tab or window) no longer moves the active tile.
  - Imports `cn` from `@/lib/cn` instead of clsx/tailwind-merge.

### Scroll Progress

- Source: [Rare UI](https://rareui.com) "Scroll Progress", https://github.com/swamimalode07/rare-ui/blob/539567414bac024260ed696c9647c737380514a7/components/ui/scroll-progress.tsx
- Commit: 539567414bac024260ed696c9647c737380514a7 (2026-09-21), the last commit before Rare UI's 2026-09-22 terms. The file is byte-identical at that commit and on main.
- License: MIT License, Copyright (c) 2026 Swami Malode (the LICENSE in force at that commit).
- Adapted in: `src/components/site/ScrollRing.tsx`.
- What was adapted:
  - Kept three pieces of the scroll-progress pill:
    - the findLast scroll-spy, as `useActiveSection` (offset 140, rAF-throttled, window only);
    - the progress ring, as `ProgressDegree`, the ° of the clim wordmark, with raw progress under reduced motion;
    - the label crossfade, as `SectionLabel`, keyed by the label string instead of a ref read during render.
  - Dropped the fixed bottom pill, the squircle section menu, the scroll lock, the measured sizes, backdrop-blur and the blur filters.
  - Recoloured to clim's tokens (stroke-line, stroke-signal).

## ObsidianUI

[ObsidianUI](https://www.obsidianui.dev), github.com/Atharvsinh-codez/ObsidianUI. License:

```
MIT License

Copyright (c) 2026 ObsidianUI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Discover Button

- Source: https://www.obsidianui.dev/docs/discover-button. The registry item is https://www.obsidianui.dev/r/discover-button.json, identical to github.com/Atharvsinh-codez/ObsidianUI `src/components/block/discover-button.tsx` and `.css`.
- License: MIT License, Copyright (c) 2026 ObsidianUI (https://github.com/Atharvsinh-codez/ObsidianUI/blob/main/LICENSE).
- Adapted in `src/components/site/LaunchButton.tsx`, which keeps a header naming the source:
  - The 84-line CSS file became Tailwind utilities using clim tokens, and the four `--obsidian-discover-*` variables became the `onWhite` / `onBlue` tones.
  - Added a separate pink icon disc (`data-launch-dot`) and a second, `sm` size.
  - lucide's ArrowRight was replaced by an arrow drawn for clim (inline SVG), and `clsx` / `tailwind-merge` became `@/lib/cn`.
  - Removed the glass border, the backdrop blur and the scale-in entrance. Font weight is 500 instead of 600.
  - The focus outline uses the clim accent (upstream's `var(--ring)` does not exist in clim).
  - The plain `<a>` / `<button>` became `LaunchLink` (next/link with the "launch" view transition), with a `useLinkStatus` pending spinner.

### Split Showcase

- Source: https://www.obsidianui.dev/docs/split-showcase (registry file https://www.obsidianui.dev/r/split-showcase.json), github.com/Atharvsinh-codez/ObsidianUI, src/components/block/split-showcase.tsx. The registry copy is byte-identical to the file at commit 996d383352843a7368904e6a6b558e2d0e19c6e8.
- License: MIT, Copyright (c) 2026 ObsidianUI.
- Adapted in src/components/site/PoolsVersus.tsx:
  - Kept: the two halves joined at a dotted seam, the outward spring (x ±12, scale 0.98, stiffness 350, damping 24), the seam that fades, and the stacked mobile layout with a horizontal seam.
  - Removed: the bundled Vercel and Tracwell logos, the sponsor defaults and their UTM links, the `children` and `compact` modes, `target="_blank"` and `select-none`.
  - Changed:
    - The content is now data-first and left-aligned (title, subtitle, stat rows, note, actions).
    - Hover and focus are handled on the static cells: pointer events, ignoring touch, plus capture-phase focus and blur, so non-link content reacts to keyboard focus.
    - The halves stack vertically on mobile, with y as the spring axis there.
    - Reduced motion is gated inside the animated values instead of dropping the props.
    - Restyled with clim tokens (bg-wash, bg-surface-2, dashed border-line, rounded-lg, --clim-shadow-lift, .dotted-divider), and every dark: class is gone.

## @web3icons/core

- The stack's logos in `src/components/site/logos.ts`, generated by `scripts/make-logos.mjs` from [`@web3icons/core`](https://www.npmjs.com/package/@web3icons/core) (a dev dependency): whole icon paths, recoloured to `currentColor`.
- License: MIT License, Copyright (c) 2024 0xa3k5 (github.com/0xa3k5/web3icons, LICENCE; the npm package ships no license file):

```
MIT License

Copyright (c) 2024 0xa3k5

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The marks themselves belong to their projects (Coinbase, Kraken, Binance, Chainlink, Ethereum, Uniswap); clim shows them to say
what it is built on, not as an endorsement.

## dotted-map

- The world's dots in `src/lib/worldDots.ts`, generated by `scripts/make-world-dots.mjs` with [`dotted-map`](https://www.npmjs.com/package/dotted-map) 2.2.3 (a dev dependency, github.com/NTag/dotted-map). Only the generated points ship; the library itself is not bundled.
- License: MIT License, Copyright (c) 2021 Basile Bruneau (`node_modules/dotted-map/LICENSE`):

```
MIT License

Copyright (c) 2021 Basile Bruneau

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- Its country shapes come from https://github.com/johan/world.geo.json (dotted-map's README), released into the public domain under the Unlicense.

## Fonts

- **Families:** Inter, Inter Tight and Doto (`src/app/layout.tsx`), and Noto Sans Math (`src/components/how/FeeFormula.tsx`: the last fallback of the formulas on /how, downloaded only by browsers that have no math font).
- **Source:** Google Fonts, self-hosted by `next/font/google`: the files are fetched at build time and served from this site, unmodified apart from Google Fonts' own subsetting.
- **License:** SIL Open Font License, Version 1.1 (https://openfontlicense.org). The copyright lines below are copied from each family's `ofl/<family>/OFL.txt` in https://github.com/google/fonts (main at `7085eb89`, 2026-10-05):

```
Inter:          Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)
Inter Tight:    Copyright 2022 The Inter Project Authors (https://github.com/rsms/inter-tight)
Doto:           Copyright 2024 The Doto Project Authors (https://github.com/oliverlalan/Doto)
Noto Sans Math: Copyright 2022 The Noto Project Authors (https://github.com/notofonts/math)
```
