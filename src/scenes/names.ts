/**
 * Every 3D scene the site can show. To add one: add its name and stage count here, add a loader
 * in `registry.ts` (TypeScript flags a name without one), and write the scene module.
 */
export const SCENE_NAMES = ['cochlea', 'journey', 'stimulation', 'attention'] as const;

export type SceneName = (typeof SCENE_NAMES)[number];

/**
 * How many stages each scene tells its story in (each module lists them at its top). A research
 * chapter that uses a scene writes one caption (`steps`) per stage; the build checks the count.
 */
export const SCENE_STAGES: Record<SceneName, number> = {
  cochlea: 4,
  journey: 5,
  stimulation: 3,
  attention: 3,
};

export function isSceneName(value: unknown): value is SceneName {
  return typeof value === 'string' && (SCENE_NAMES as readonly string[]).includes(value);
}
