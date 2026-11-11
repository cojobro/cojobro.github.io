import type { BufferGeometry, Material, Object3D, Texture } from 'three';

type Renderable = Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };

/** Frees the GPU resources held by an object tree: geometries, materials and their textures. */
export function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    const { geometry, material } = object as Renderable;
    geometry?.dispose();
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const item of materials) disposeMaterial(item);
  });
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (isTexture(value)) value.dispose();
  }
  material.dispose();
}

function isTexture(value: unknown): value is Texture {
  return typeof value === 'object' && value !== null && (value as Texture).isTexture === true;
}
