# cojobro.github.io

Personal and research website of Conor J. Brown, built with [Astro](https://astro.build) and
[three.js](https://threejs.org), deployed to GitHub Pages.

The site is drawn as a measuring instrument: a light faceplate with printed legends, and screens
of black glass where things are shown in light. The home page opens with a working one, a
cochlear-implant listening sketch you can play (see "The instrument").

## Quick start

Requires Node.js 22.22 or newer.

```sh
npm install           # once
npm run dev           # local server with hot reload at http://localhost:4321
npm run build         # type-check (astro check), then build into dist/
npm run preview       # serve the built dist/ locally
npm run format        # format everything with Prettier (format:check only checks)
```

`npm run build` must finish with zero `astro check` diagnostics, and `npm run format:check` must
pass.

## Deploying

Every push to `main` builds the site and publishes it (`.github/workflows/deploy.yml`, which runs
`npm run build` on Node 24). One-time setup: in the repository's **Settings → Pages**, set
**Source** to **GitHub Actions**.

## Where things live

```text
src/
├── data/                  Structured content (TypeScript, type-checked)
│   ├── site.ts            Name, email, navigation, profile links, CV PDF path
│   ├── profile.ts         Tagline, bio, the path here, career goal, interests, colophon
│   ├── home.ts            Headings and short texts of the home page's sections
│   ├── instrument.ts      Every word on the home page's instrument, and its recording
│   ├── news.ts            Dated highlights (home page)
│   ├── cv.ts              Education, positions, honors, publications, contributions, skills
│   ├── research.ts        Research page headline, introduction, color legend
│   └── types.ts           The shapes of the CV and site data
├── content/               Long-form content: Markdown with validated frontmatter
│   ├── research/          One file per research entry
│   └── projects/          One file per project
├── content.config.ts      The frontmatter schemas, documented field by field
├── pages/                 One file per route: index, cv, projects, 404, research/, lab/
├── layouts/BaseLayout.astro   The page shell: head, header, main, footer
├── components/            Shared UI; components/research/ for the research pages
├── styles/
│   ├── tokens.css         Design tokens: colors (faceplate and screen), type, spacing, motion
│   └── global.css         Base styles and a few utilities (.container, .prose, .kicker, …)
├── instrument/            The home page's instrument (see "The instrument")
├── scenes/                three.js scenes (see "3D scenes")
│   ├── core/              The host that runs scenes, their contract, the palette
│   └── lib/               Helpers shared by the scenes
├── lib/                   Small helpers: ordered entries, dates, publications, grouping,
│                          spiral SVG paths
└── assets/                Images, optimized at build time
public/
├── audio/                 The instrument's recording
├── files/                 PDFs served as-is (CV, reports)
└── favicon.svg, og.png    Other files served at the site root
```

Content is data: anything about Conor lives in `src/data/` or `src/content/`; pages and
components hold structure and short labels only.

## How do I…

**Update the CV.** Edit `src/data/cv.ts`; every list is newest first, and the fields are
described in `src/data/types.ts`. Publications need a stable `id` (research entries cite them by
it). Replace `public/files/Conor_Brown_CV.pdf` with the new PDF under the same name (or change
`cvPdf` in `src/data/site.ts`).

**Edit the bio.** `src/data/profile.ts`: the tagline (the sentence on the instrument's screen;
its first clause, up to the first comma, is set brighter), the bio (one string per paragraph), the
path here (`path`, one stop per entry), the career goal (its first sentence is set large) and the
interests. Name, role and contact details are in `src/data/site.ts`.

**Post news.** Add an item at the top of `src/data/news.ts`: `date` as `"YYYY-MM"` (or `"YYYY"`
when the month is unknown; anything else fails the build), `text`, and an optional `href`. Keep
it to a handful.

**Add a research entry.** Create `src/content/research/<id>.md`; the file name becomes the URL
`/research/<id>/` and the Markdown body that page's long version, where the technical detail
belongs. The frontmatter (`src/content.config.ts`) holds a `title`, `kicker`, one-sentence
`summary`, `period` and `order`; an `overview`, the idea in a short paragraph of plain language;
`keywords`; related `publications` by id from `cv.ts`; and a `status`. `active` and `exploratory`
entries are chapters of `/research/` and rows of the home page's index, in `order`; `earlier` ones
are cards below the chapters. A chapter can tell its story beside a 3D scene: set `scene` (a name
from `src/scenes/names.ts`), `sceneLabel` (what the scene shows, read to screen readers and shown
where it cannot run), and `steps`, exactly one caption per stage of the scene (`SCENE_STAGES` in
the same file; the build fails on a mismatch). `draft: true` hides an entry.

**Add a project.** Create `src/content/projects/<id>.md` with `title`, a one- or two-sentence
`summary`, `order`, and optionally `year`, `tags` and `links`; the body is the description. For a
photo, put it in `src/assets/projects/` and set `cover` (a path relative to the Markdown file)
and `coverAlt`.

**Add a page or a branch of the site.** Create `src/pages/<name>.astro` with `BaseLayout` (pass
`title` and `description`) and start it with `PageHeader`; build it from `Section`s. To make it a
branch, add it to `nav` in `src/data/site.ts`: it appears in the header, in the footer and as a
card on the home page.

**Change colors, fonts, spacing.** `src/styles/tokens.css`; components use only these
variables. There are two surfaces. The faceplate (`:root`) is light enamel with black ink and one
vermilion accent. The screen (`.screen`) is black glass: put that class on any element and
everything inside takes the dark values of the same tokens, which is how the footer, the goal
statement and every scene are drawn. The 3D scenes and the instrument read the `--color-*` tokens
listed in `src/scenes/core/palette.ts` from their own element, so they follow automatically (keep
those plain hex values). The three meaning colors are one legend everywhere: `signal` (cyan on
glass) is electrical stimulation, `spike` (amber) is nerve firing, `decode` (violet) is models and
decoding. Type is Newsreader (the serif that speaks), Archivo (the grotesque that labels) and
JetBrains Mono (numbers read off the instrument). Breakpoints are 40, 48 and 64 rem (see the top
of the file).

**Make content rise into view on scroll.** Add `data-reveal` to an element, and
`style="--reveal-order: n"` to stagger siblings. It is off without JavaScript and for visitors
who prefer reduced motion.

**Replace the social card.** `public/og.png` is a 1200 × 630 screenshot of the instrument's
screen; any image of that size works.

## The instrument

The home page opens with `src/components/Instrument.astro`: a screen showing a stylized cochlea
with its nerve fibers and a 22-contact electrode array, and a deck of controls on the faceplate
beneath it. Pressing play loops a short recording, heard either as it is ("healthy ear") or
through a sketch of a cochlear implant, and the picture follows the sound: current at the
contacts in cyan, nerve fibers firing in amber, and a scrolling record along the foot of the
screen. The visitor can use fewer electrodes, widen the current spread, choose a nerve with
gaps, erase fibers by dragging across the nerve, or record a few seconds of their own voice.

It is an explanation, not a result: a channel vocoder of the kind used to let people with
ordinary hearing sample implant hearing. It is not the digital twin, it simulates no one's ear,
and the fine print under the controls says so (`note` in `src/data/instrument.ts`). Keep that
note accurate if the instrument changes.

The parts, in `src/instrument/`:

- `model.ts` is the one description both halves work from: the spiral, the array, which pitch
  each place hears and each contact is assigned, how current reaches the nerve (`reach`), the
  example nerves (`NERVES`), and the mixing matrix that turns all of it into sound. Change the
  ear or the implant here and the picture and the sound change together.
- `vocoder.worklet.js` runs on the audio thread: band-pass analysis into channels, envelopes, the
  loudest few channels per cycle, then noise bands at the places where nerve answers. Plain
  JavaScript with no imports, because it is loaded as a file; its header documents each step.
- `engine.ts` owns the Web Audio graph: the recording played dry and through the vocoder at
  once, cross-faded, plus the microphone recording. It is downloaded on the first press of play.
- `display.ts` draws the screen on three canvases: what never moves, what the sound sets off
  (with an afterglow), and the scrolling record.

**Replace the recording.** `public/audio/sentence.mp3` is a synthetic voice reading two Harvard
sentences, a placeholder. A few seconds of clear speech in your own voice would be better: save
it under the same name (any format browsers decode; mono is enough), or point `sample` in
`src/data/instrument.ts` at another file, and update `note.transcript` there to match what is
said.

**Change the words.** Every label, prompt and note on the instrument is in
`src/data/instrument.ts`.

## 3D scenes

Scenes draw in added light, so they live on screens: put a scene inside an element with the
`screen` class and give that element a size. Pages never touch three.js: they place a scene with
`<SceneCanvas scene="cochlea" label="…" />` (add `scroll` to drive it by scrolling), and
`src/scenes/core/mount.ts` does the rest. It downloads three.js and the scene only when the scene
nears the viewport, renders only while it is visible, feeds it scroll progress and the pointer,
shows a still for visitors who prefer reduced motion, and shows the `fallback` slot (by default
the label) where WebGL or JavaScript is unavailable. To keep the subject clear of anything laid
over the screen's edges (a legend, a figure number), set `--scene-inset` on the scene's parent,
and the scene frames its subject in the room left over; the research chapters use
`--scene-inset-story` from `tokens.css`.

On the research page each chapter's screen stays in view while its captions scroll past
(`src/components/research/ResearchChapter.astro`, whose header explains how captions line up with
the scene's stages).

To add a scene:

1. Add its name and stage count to `src/scenes/names.ts`, and a loader to
   `src/scenes/registry.ts` (TypeScript insists).
2. Write `src/scenes/<name>.ts`: list the stages at the top of the file and default-export a
   `SceneFactory`. The contract is in `src/scenes/core/types.ts`: with N stages, stage i covers
   scroll progress [i/N, (i+1)/N] and the scene rests on its final stage when shown without
   scrolling (a research entry's page); `resize` frames the subject in the focus rectangle it is
   given; reduced motion gets a meaningful still; `dispose` frees everything (`disposeObject`
   does it for a whole scene graph).
3. Develop it at `/lab/<name>/` on the dev server: the scene alone on a screen filling the
   window, with the area it should frame its subject in outlined. Lab pages are never part of the
   production build.
4. Use it from a research entry with `scene: <name>` and one `steps` caption per stage.

The existing scenes (`cochlea.ts`, `journey.ts`, `stimulation.ts`, `attention.ts`) all read the
same way: stages, constants, the factory, then the parts in story order. Helpers in
`src/scenes/lib/` worth knowing:

- `motion.ts`: `StageProgress` turns scroll progress into eased stage weights; `DampedPointer`
  for parallax.
- `camera.ts`: `aimAtFocus`, `fitDistance`, `orbit`, `narrowness` and `pointScale` frame a
  perspective camera for any shape of view.
- `glow-points.ts`: luminous points, as a ready-made material (`createGlowPoints`) or as GLSL
  snippets for custom point shaders.
- `strips.ts`: glowing lines that keep their width on any screen, placed by the shader or along a
  `Polyline` path (`createPathStrip` with `createPathMaterial`).
- `materials.ts`: the additive glow material and a glass shell with a luminous rim.
- `glsl.ts` (hash, depth fog, number literals, `alwaysDrawn`), `dust.ts` (ambient motes),
  `random.ts` (seeded randomness), `speech.ts` (synthetic speech for shaders), and
  `cochlea-geometry.ts` (the procedural cochlea).

Scenes and the instrument are procedural and stylized: never use or imitate real patient anatomy
or the lab's meshes.

## Versions

Astro is pinned to 7.4.1 because later 7.4.x releases require Node.js 22.23.4 or newer. After
upgrading Node, run `npm install astro@latest` and `npm run build` to move up.
