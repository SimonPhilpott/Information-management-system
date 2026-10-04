import React from 'react';
import PortraitFace from './PortraitFace';
import closed from '../../assets/faces/chronicler/closed.webp';
import small from '../../assets/faces/chronicler/small.webp';
import mid from '../../assets/faces/chronicler/mid.webp';
import wide from '../../assets/faces/chronicler/wide.webp';
import round from '../../assets/faces/chronicler/round.webp';
import eyes from '../../assets/faces/chronicler/expr/eyes.json';
import { buildFrames } from './portraitArt';

const EXPR = import.meta.glob('../../assets/faces/chronicler/expr/*.webp', { eager: true, query: '?url', import: 'default' });

// The Chronicler: an old wizard-scribe in a worn brown hat with a jewel, deep lines and a long grey beard.
// A painted portrait (640 x 640) with mouth shapes made from it and aligned to it; his lips move beneath
// the moustache and the beard moves with the jaw.
export const CHRONICLER_ART = {
  frames: buildFrames({ closed, small, mid, wide, round }, EXPR),
  eyes, // per expression, fitted to each painted eye opening
  aspect: '1 / 1',
  background: '#020403',
  pivot: '50% 95%',
  motion: 0.7, // an old man moves less
};

export default function ChroniclerFace(props) {
  return <PortraitFace art={CHRONICLER_ART} {...props} />;
}
