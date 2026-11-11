import type { SceneFactory } from './core/types';
import type { SceneName } from './names';

type SceneModule = { default: SceneFactory };

/**
 * One lazy loader per scene, so a page downloads three.js and a scene's code only when that
 * scene is about to appear. TypeScript requires an entry for every `SceneName`.
 */
export const sceneLoaders: Record<SceneName, () => Promise<SceneModule>> = {
  cochlea: () => import('./cochlea'),
  journey: () => import('./journey'),
  stimulation: () => import('./stimulation'),
  attention: () => import('./attention'),
};
