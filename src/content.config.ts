/**
 * Long-form content: one Markdown file per research chapter or project. The frontmatter is
 * validated against these schemas at build time; the Markdown body is the entry's long version.
 * Structured CV data lives in `src/data/` instead.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { SCENE_NAMES, SCENE_STAGES } from './scenes/names';

const research = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/research' }),
  schema: z
    .object({
      title: z.string(),
      /** Short label above the title, e.g. "Digital twins". */
      kicker: z.string(),
      /** One-sentence hook for cards and the page's meta description. */
      summary: z.string(),
      /**
       * The idea in a short paragraph of plain language, for anyone: shown with the chapter on the
       * research page and "in brief" on its own page, above the long version (the Markdown body).
       */
      overview: z.string(),
      /** 3D scene that illustrates the chapter (see `src/scenes/names.ts`); omit for none. */
      scene: z.enum(SCENE_NAMES).optional(),
      /**
       * What the scene shows, in a sentence or two: read to screen-reader users, and shown where
       * the scene cannot run. Required with `scene`.
       */
      sceneLabel: z.string().optional(),
      /**
       * Captions that walk through the scene as the reader scrolls: exactly one per stage of the
       * scene (`SCENE_STAGES`; each scene module describes its stages).
       */
      steps: z.array(z.string()).default([]),
      /**
       * `active` and `exploratory` (current work) are the research page's chapters, told over
       * their scene; `earlier` (past work) is listed as cards after them.
       */
      status: z.enum(['active', 'exploratory', 'earlier']),
      /** As displayed, e.g. "2025 – present". */
      period: z.string(),
      /** Position on the research page, ascending. */
      order: z.number(),
      keywords: z.array(z.string()).default([]),
      /** Ids of related publications in `src/data/cv.ts`. */
      publications: z.array(z.string()).default([]),
      /** Hide the entry everywhere without deleting it. */
      draft: z.boolean().default(false),
    })
    .superRefine(({ scene, sceneLabel, steps }, context) => {
      if (!scene) {
        if (steps.length > 0) {
          context.addIssue({
            code: 'custom',
            path: ['steps'],
            message: '`steps` only apply with a `scene`.',
          });
        }
        return;
      }
      if (!sceneLabel) {
        context.addIssue({
          code: 'custom',
          path: ['sceneLabel'],
          message: '`sceneLabel` is required when `scene` is set.',
        });
      }
      const stages = SCENE_STAGES[scene];
      if (steps.length !== stages) {
        context.addIssue({
          code: 'custom',
          path: ['steps'],
          message: `The "${scene}" scene has ${stages} stages, so \`steps\` needs ${stages} captions (found ${steps.length}).`,
        });
      }
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        /** One or two sentences for the project card. */
        summary: z.string(),
        /** As displayed, e.g. "2023" or "2021 – 2022"; omit when not known rather than guessing. */
        year: z.string().optional(),
        /** Position on the projects page, ascending. */
        order: z.number(),
        tags: z.array(z.string()).default([]),
        /** Image in `src/assets/`, relative to the Markdown file. */
        cover: image().optional(),
        /** Describes the cover for screen readers. Required with `cover`. */
        coverAlt: z.string().optional(),
        links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
        draft: z.boolean().default(false),
      })
      .refine((entry) => !entry.cover || entry.coverAlt, {
        message: '`coverAlt` is required when `cover` is set.',
        path: ['coverAlt'],
      }),
});

export const collections = { research, projects };
