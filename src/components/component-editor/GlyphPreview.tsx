/**
 * Live schematic glyph preview: the exact symbol the 2.5D schematic renders
 * for this category, on a small orbitable stage.
 */

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { DocCategory } from '../../document';
import { SchematicGlyph, OpticalAxisArrow } from '../schematic/glyphs';

export function GlyphPreview({ category, label }: { category: DocCategory; label: string }) {
  return (
    <Canvas
      camera={{ position: [45, 35, 55], fov: 40 }}
      style={{ width: '100%', height: 180, borderRadius: 8, background: '#10151c' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[60, 80, 40]} intensity={1.1} />
      <SchematicGlyph category={category} label={label} />
      <OpticalAxisArrow />
      <OrbitControls enablePan={false} minDistance={40} maxDistance={140} />
    </Canvas>
  );
}
