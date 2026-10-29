import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { getModelFor } from './modelRegistry.js';
import { readGeminiJson } from './geminiClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = path.join(__dirname, '..', 'data', 'dnd_avatars');
const DEFAULT_MODEL = 'gemini-3.1-flash-lite-image';

// Ensure avatar storage directory exists
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

/**
 * Returns the absolute filepath for an avatar by key/filename.
 */
export function getAvatarFilePath(key) {
  if (!key || typeof key !== 'string') return null;
  const clean = path.basename(key).replace(/[^a-zA-Z0-9._-]/g, '');
  const full = path.join(AVATAR_DIR, clean);
  return fs.existsSync(full) ? full : null;
}

/**
 * Parses and extracts image buffer and mimeType from an attached reference (data URL, object, or file path).
 */
export function parseReferenceImage(ref) {
  if (!ref) return null;
  try {
    if (typeof ref === 'string') {
      const match = ref.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (match) {
        return {
          mimeType: match[1],
          buffer: Buffer.from(match[2], 'base64')
        };
      }
      if (fs.existsSync(ref)) {
        const ext = path.extname(ref).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return {
          mimeType,
          buffer: fs.readFileSync(ref)
        };
      }
      if (ref.length > 100 && !ref.includes(' ') && !ref.includes('\n')) {
        return {
          mimeType: 'image/jpeg',
          buffer: Buffer.from(ref, 'base64')
        };
      }
    } else if (typeof ref === 'object' && ref.data) {
      const mimeType = ref.mimeType || 'image/jpeg';
      const b64 = typeof ref.data === 'string' && ref.data.startsWith('data:')
        ? ref.data.split(',')[1]
        : ref.data;
      return {
        mimeType,
        buffer: Buffer.isBuffer(b64) ? b64 : Buffer.from(b64, 'base64')
      };
    }
  } catch (err) {
    console.warn('[DndAvatar] Failed to parse reference image:', err.message);
  }
  return null;
}

/**
 * Constructs an evocative visual prompt for a tabletop RPG character portrait bust.
 */
export function buildAvatarPrompt({
  name = '',
  roleOrClass = '',
  ruleset = null,
  concept = '',
  details = '',
  backstory = '',
  premise = '',
  hasReferencePhoto = false
} = {}) {
  const genre = String(ruleset?.metadata?.genre || ruleset?.genre || '').toLowerCase();
  const gameName = String(ruleset?.name || '');

  let styleMood = 'Classic fantasy oil painting style, evocative tabletop RPG character portrait bust with textured brushwork and rich chiaroscuro shadows';
  if (/horror|cthulhu|arkham/i.test(genre) || /cthulhu|arkham/i.test(gameName)) {
    styleMood = 'Gritty 1920s vintage film noir portrait, dramatic chiaroscuro shadows, sepia and muted tones, cosmic dread';
  } else if (/dark fantasy|gothic|ker nethalas|mork borg|shadowdark/i.test(genre) || /ker nethalas|mork borg|shadowdark/i.test(gameName)) {
    styleMood = 'Dark gothic fantasy digital oil painting, textured impasto brushwork, sombre and weathered grimdark aesthetic, torchlight reflections, cold stone catacomb backdrop';
  } else if (/sci-fi|cyberpunk|space|mothership|alien/i.test(genre) || /mothership|traveller/i.test(gameName)) {
    styleMood = 'Retro-futuristic gritty sci-fi painted portrait, industrial cabin atmosphere, harsh cockpit lighting';
  }

  const promptParts = [
    `Character portrait avatar for a tabletop roleplaying game (${gameName || 'Fantasy RPG'}).`,
    `Framing: Head-and-shoulders bust portrait, face centered and clearly visible, ideal for a circular or square character profile picture.`,
    `Style: ${styleMood}.`,
  ];

  if (hasReferencePhoto) {
    promptParts.push(
      `Primary Likeness Instruction: Use the attached photo as the foundational facial likeness for this character. Preserve the underlying facial structure, bone structure, nose shape, jawline, and recognisability of the person in the photo.`,
      `Artistic Medium & Medium Translation: Transform the photographic input completely into a painted illustration (digital oil, textured acrylic, or gouache on canvas). Strictly NO modern photographic finish, NO photobashing look, NO plastic digital smoothing. It must feel like an authentic, masterfully painted character illustration.`
    );
  }

  // Tonal Weathering and Haggard Ordeal Condition
  promptParts.push(
    `Weathered & Haggard Physical Condition: The character must look battle-tested, worn, and pushed to the edges of survival. Portray them with weary fatigue and dark hollows beneath the eyes, hollowed or gaunt cheeks, chapped lips, soot and grime smudged into the pores, dishevelled or unkempt hair, and subtle cuts or abrasions. Their eyes should carry the haunted, resilient gaze of someone fighting against overwhelming odds.`
  );

  // Incorporate Opening Character Situation & Premise
  if (premise && premise.trim()) {
    promptParts.push(
      `Opening Situation & Environmental Ordeal: The character is in the midst of this starting situation: "${premise.trim().slice(0, 350)}". Their facial expression, damp skin, smeared dirt, dishevelled appearance, and the ambient lighting (e.g. flickering tallow torchlight, murky marsh gas haze, cold damp cellar stone) must directly reflect this harrowing opening scene.`
    );
  }

  if (name) promptParts.push(`Character Name: ${name}.`);
  if (roleOrClass) promptParts.push(`Archetype / Class: ${roleOrClass}.`);
  if (concept) promptParts.push(`Concept: ${concept}.`);
  if (details) {
    promptParts.push(
      `Physical Appearance & Distinctive Features: ${details}. Ensure these specific physical traits, scars, hair colour/style, armour, headwear, cloaks, and gear are prominently illustrated on the portrait.`
    );
  }
  if (backstory) promptParts.push(`Character Context: ${backstory.slice(0, 200)}.`);

  promptParts.push(
    `Composition: High quality detailed digital painting, heroic and atmospheric lighting, rich textures, expressive eyes. Strictly NO text, NO labels, NO title cards, NO UI borders, NO watermarks, NO modern frames. Square 1:1 aspect ratio.`
  );

  return promptParts.join('\n');
}

/**
 * Generates an avatar portrait image using Gemini image generation, caching locally on disk.
 */
export async function generateHeroAvatar({
  name = '',
  roleOrClass = '',
  ruleset = null,
  concept = '',
  details = '',
  backstory = '',
  premise = '',
  referenceImage = null
} = {}) {
  const refParsed = parseReferenceImage(referenceImage);
  const hasReferencePhoto = Boolean(refParsed && refParsed.buffer?.length);
  const prompt = buildAvatarPrompt({ name, roleOrClass, ruleset, concept, details, backstory, premise, hasReferencePhoto });

  let hashSeed = `${prompt}|avatar_v2`;
  if (refParsed) {
    const refHash = crypto.createHash('sha1').update(refParsed.buffer).digest('hex').slice(0, 16);
    hashSeed += `|ref_${refHash}`;
  }
  const hash = crypto.createHash('sha1').update(hashSeed).digest('hex').slice(0, 20);
  const filename = `${hash}.jpg`;
  const targetFile = path.join(AVATAR_DIR, filename);

  // Return cached file if already generated
  if (fs.existsSync(targetFile)) {
    return {
      success: true,
      avatarUrl: `/api/dnd/avatars/${filename}`,
      filename,
      cached: true
    };
  }

  const model = getModelFor('image') || DEFAULT_MODEL;
  console.log(`[DndAvatar] Generating character portrait for "${name || 'Hero'}" using model: ${model}${hasReferencePhoto ? ' (with reference likeness)' : ''}`);

  const parts = [];
  if (refParsed) {
    parts.push({
      inlineData: {
        mimeType: refParsed.mimeType || 'image/jpeg',
        data: refParsed.buffer.toString('base64')
      }
    });
  }
  parts.push({ text: prompt });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.gemini.apiKey
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio: '1:1' }
          }
        }),
        signal: AbortSignal.timeout(60000)
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Gemini image generation HTTP ${res.status}: ${errorText.slice(0, 150)}`);
      }

      const json = await (readGeminiJson ? readGeminiJson(res, model, 'image') : res.json());
      const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);

      if (!part?.inlineData?.data) {
        throw new Error('Gemini returned no image data.');
      }

      const imgBuffer = Buffer.from(part.inlineData.data, 'base64');
      fs.writeFileSync(targetFile, imgBuffer);

      return {
        success: true,
        avatarUrl: `/api/dnd/avatars/${filename}`,
        filename,
        cached: false
      };
    } catch (err) {
      console.warn(`[DndAvatar] Attempt ${attempt} failed:`, err.message);
      if (attempt >= 2) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
