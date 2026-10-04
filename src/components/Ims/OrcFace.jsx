import React from 'react';
import PortraitFace from './PortraitFace';
import closed from '../../assets/faces/orc/closed.webp';
import small from '../../assets/faces/orc/small.webp';
import mid from '../../assets/faces/orc/mid.webp';
import wide from '../../assets/faces/orc/wide.webp';
import round from '../../assets/faces/orc/round.webp';
import eyes from '../../assets/faces/orc/expr/eyes.json';
import { buildFrames } from './portraitArt';

const EXPR = import.meta.glob('../../assets/faces/orc/expr/*.webp', { eager: true, query: '?url', import: 'default' });

// The orc chief (Throg), animated from the supplied painting (424 x 494). The closed frame IS the painting;
// the other mouth shapes were made from it and aligned to it, so only the mouth and jaw ever change.
export const ORC_ART = {
  frames: buildFrames({ closed, small, mid, wide, round }, EXPR),
  eyes, // per expression, fitted to each painted eye opening
  aspect: '424 / 494',
  background: '#3e3e3e',
  pivot: '50% 92%',
  motion: 1,
};

export default function OrcFace(props) {
  return <PortraitFace art={ORC_ART} {...props} />;
}
