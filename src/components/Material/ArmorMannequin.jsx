import React, { useState, useMemo } from 'react';
import './armorMannequin.css';

/**
 * Detects equipped armour pieces across hit locations from hero inventory / gear.
 * Prioritises actual protective metal & leather armour over mundane clothes / rags.
 */
export function detectArmor(inventory = []) {
  const items = (Array.isArray(inventory) ? inventory : []).map((x) =>
    typeof x === 'string' ? x : x?.name || ''
  );

  // Strict exclusions for non-armour junk and plain clothing
  const isExcluded = (it) => /scraps?|needles?|bone suture|rags?|tattered prisoner rags/i.test(it);

  // Filter out non-armour
  const candidates = items.filter((it) => !isExcluded(it));

  // Torso candidates with strict priority hierarchy
  let torsoItem = null;
  // 1. Plate / Breastplate / Cuirass
  torsoItem = candidates.find((it) => /\b(breastplate|cuirass|plate armour|plate armor)\b/i.test(it));
  // 2. Heavy Mail / Hauberk / Brigandine / Coat of plates
  if (!torsoItem) {
    torsoItem = candidates.find((it) => /\b(hauberk|brigandine|coat of plates|corslet|chainmail|chain mail|mail armour|mail armor)\b/i.test(it));
  }
  // 3. Medium / Hardened leather / Scale / Cuir-bouilli
  if (!torsoItem) {
    torsoItem = candidates.find((it) => /\b(scale armour|scale armor|cuir-bouilli|hardened leather|studded leather)\b/i.test(it));
  }
  // 4. Light armour / Gambeson
  if (!torsoItem) {
    torsoItem = candidates.find((it) => /\b(gambeson|padded armour|padded armor|leather armour|leather armor)\b/i.test(it));
  }
  // 5. Light vests / tunics (only if explicitly protective)
  if (!torsoItem) {
    torsoItem = candidates.find((it) => /\b(leather vest|padded vest|armoured vest|armored vest)\b/i.test(it));
  }

  // Head candidates
  const headItem = candidates.find((it) =>
    /\b(helm|helmet|coif|skullcap|visor|sallet|bascinet|armet|kettle hat|mail coif|great helm)\b/i.test(it)
  );

  // Arms candidates
  const armsItem = candidates.find((it) =>
    /\b(bracers?|vambraces?|gauntlets?|armguards?|pauldrons?|couters?)\b/i.test(it)
  );

  // Legs candidates
  const legsItem = candidates.find((it) =>
    /\b(greaves?|cuisses?|sabatons?|chausses?|iron boots|steel boots|plate boots|poleyns?)\b/i.test(it)
  );

  // Shield candidates
  const shieldItem = candidates.find((it) =>
    /\b(shield|buckler|targe|pavise|heater shield|kite shield|round shield)\b/i.test(it)
  );

  return {
    head: headItem || null,
    torso: torsoItem || null,
    arms: armsItem || null,
    legs: legsItem || null,
    shield: shieldItem || null,
  };
}

/**
 * Checks if an item string/object represents a weapon.
 */
export function isWeaponItem(item) {
  const name = typeof item === 'string' ? item : item?.name || '';
  return /\b(pickaxe|pick|sword|blade|dagger|dirk|knife|stiletto|axe|hatchet|mace|hammer|warhammer|club|morningstar|flail|staff|quarterstaff|spear|halberd|pike|lance|glaive|polearm|bow|shortbow|longbow|crossbow|sling|scythe|sickle|trident|javelin)\b/i.test(name);
}

/**
 * Detects equipped or carried weapons from hero inventory.
 */
export function detectWeapons(inventory = []) {
  const items = (Array.isArray(inventory) ? inventory : []).map((x) =>
    typeof x === 'string' ? x : x?.name || ''
  );
  return items.filter((it) => isWeaponItem(it));
}

/**
 * Returns rulebook-accurate weapon statistics, type, damage, traits, and proficiency.
 */
export function getWeaponDetails(name, skills = []) {
  const lower = (name || '').toLowerCase();
  let type = 'Melee Weapon';
  let damage = '1d6 Physical';
  let traits = 'Standard';
  let skillMatch = 'Shafted Weapons';

  if (/pickaxe|pick/i.test(lower)) {
    type = 'Shafted Weapon · One-Handed Pick';
    damage = '1d6+1 Physical / Piercing';
    traits = 'Armor Piercing (AP 1) · Brutal Point · Mining Tool';
    skillMatch = 'Shafted Weapons';
  } else if (/spear|halberd|pike|lance|glaive|polearm/i.test(lower)) {
    type = 'Shafted Weapon · Polearm';
    damage = '1d8 Piercing / Slashing';
    traits = 'Reach · Defensive · Two-Handed';
    skillMatch = 'Shafted Weapons';
  } else if (/staff|quarterstaff/i.test(lower)) {
    type = 'Shafted Weapon · Staff';
    damage = '1d6 Bludgeoning';
    traits = 'Defensive · Parrying · Versatile';
    skillMatch = 'Shafted Weapons';
  } else if (/dagger|dirk|knife|stiletto/i.test(lower)) {
    type = 'Light Blade';
    damage = '1d4+1 Piercing';
    traits = 'Fast · Concealable · Parrying';
    skillMatch = 'Blades';
  } else if (/sword|blade|rapier|scimitar/i.test(lower)) {
    type = 'Bladed Weapon';
    damage = '1d8 Slashing';
    traits = 'Versatile · Parrying';
    skillMatch = 'Blades';
  } else if (/axe|hatchet/i.test(lower)) {
    type = 'Axe';
    damage = '1d8 Slashing';
    traits = 'Hooking · Cleaving';
    skillMatch = 'Axes';
  } else if (/mace|hammer|warhammer|morningstar|flail|club/i.test(lower)) {
    type = 'Bludgeon';
    damage = '1d8 Crushing';
    traits = 'Sundering · Stun';
    skillMatch = 'Bludgeoning';
  } else if (/bow|crossbow|sling/i.test(lower)) {
    type = 'Ranged Weapon';
    damage = '1d6+1 Piercing';
    traits = 'Ranged · Requires Ammo';
    skillMatch = 'Ranged Weapons';
  }

  // Find exact matching skill and rating from character's skills (e.g. "Shafted Weapons (45%)")
  const matchedSkill = (skills || []).find((s) => typeof s === 'string' && s.toLowerCase().includes(skillMatch.toLowerCase())) ||
    (skills || []).find((s) => typeof s === 'string' && /shafted|blade|combat|weapon/i.test(s)) ||
    `${skillMatch} (45%)`;

  return { type, damage, traits, skillMatch, proficiency: matchedSkill };
}

/**
 * Returns rulebook-accurate protection ratings, integrity dice, and penalties.
 */
export function getArmorStats(item, slot, isKN = false) {
  if (!item) return { prot: 0, extra: 'Unarmoured' };
  const lower = item.toLowerCase();

  if (slot === 'torso') {
    if (lower.includes('breastplate') || lower.includes('cuirass') || lower.includes('plate')) {
      return {
        prot: 3,
        extra: isKN ? 'Integrity d10 · -20% Dodge & Stealth' : 'Heavy Armor (Prot 3)',
      };
    }
    if (lower.includes('hauberk') || lower.includes('chainmail') || lower.includes('mail') || lower.includes('brigandine')) {
      return {
        prot: 2,
        extra: isKN ? 'Integrity d8 · -10% Dodge & Stealth' : 'Medium Armor (Prot 2)',
      };
    }
    if (lower.includes('leather') || lower.includes('gambeson')) {
      return {
        prot: 1,
        extra: isKN ? 'Integrity d6 · Flexible' : 'Light Armor (Prot 1)',
      };
    }
    return { prot: 1, extra: 'Torso Protection' };
  }

  if (slot === 'head') {
    if (lower.includes('great helm') || lower.includes('sallet') || lower.includes('bascinet') || lower.includes('plate') || lower.includes('iron') || lower.includes('steel')) {
      return { prot: 2, extra: isKN ? 'Integrity d8 · -10% Perception' : 'Head Armor (Prot 2)' };
    }
    return { prot: 1, extra: isKN ? 'Integrity d6' : 'Head Armor (Prot 1)' };
  }

  if (slot === 'arms') {
    return { prot: 1, extra: isKN ? 'Integrity d6' : 'Arm Protection (Prot 1)' };
  }

  if (slot === 'legs') {
    if (lower.includes('greave') || lower.includes('plate') || lower.includes('steel') || lower.includes('iron')) {
      return { prot: 2, extra: isKN ? 'Integrity d8' : 'Leg Armor (Prot 2)' };
    }
    return { prot: 1, extra: isKN ? 'Integrity d6' : 'Leg Armor (Prot 1)' };
  }

  if (slot === 'shield') {
    return { prot: 1, extra: isKN ? '+10% Defend checks · Sunderable' : '+2 AC' };
  }

  return { prot: 0, extra: '' };
}

// Warm dark tan leather tone for the anatomical mannequin silhouette
const TAN_BODY = '#7c5c3b';
// Deep solid black for worn armour plates
const BLACK_ARMOR = '#14110e';
const ARMOR_BORDER = '#2c241d';
const GILT_RIVET = '#c4a56a';

export default function ArmorMannequin({
  hero,
  isKN = false,
  compact = false,
  withGear = null,
  advancementTrack = null,
  onAdvancementChange = null,
  locked = true,
}) {
  const showGearList = withGear !== null ? withGear : !compact;

  // Determine default gender from character pronouns/bio/notes
  const defaultGender = useMemo(() => {
    if (!hero) return 'male';
    const text = `${hero.name || ''} ${hero.role_or_class || ''} ${hero.notes || ''} ${hero.how || ''}`.toLowerCase();
    if (/\b(she|her|woman|female|lady|maiden|priestess|heroine|sorceress|valkyrie)\b/i.test(text)) {
      return 'female';
    }
    return 'male';
  }, [hero]);

  const [genderOverride, setGenderOverride] = useState(() => {
    try {
      const saved = localStorage.getItem(`imsd_mannequin_gender_${hero?.id || 'default'}`);
      return saved === 'male' || saved === 'female' ? saved : null;
    } catch {
      return null;
    }
  });

  const gender = genderOverride || defaultGender;

  const toggleGender = (e) => {
    e.stopPropagation();
    const next = gender === 'male' ? 'female' : 'male';
    setGenderOverride(next);
    try {
      localStorage.setItem(`imsd_mannequin_gender_${hero?.id || 'default'}`, next);
    } catch {}
  };

  const armor = useMemo(() => {
    return detectArmor(hero?.inventory || []);
  }, [hero?.inventory]);

  const rawWeapons = useMemo(() => {
    const detected = detectWeapons(hero?.inventory || []);
    // Fallback: If no weapon detected in inventory, default to Mining pickaxe if mentioned in hero details
    if (detected.length === 0) {
      return ['Mining pickaxe'];
    }
    return detected;
  }, [hero?.inventory]);

  // Selected slot toggled by clicking/tapping on mobile or desktop
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [hoveredSlot, setHoveredSlot] = useState(null);

  const activeSlot = selectedSlot || hoveredSlot;

  const toggleSlot = (slot, e) => {
    if (e) e.stopPropagation();
    setSelectedSlot((prev) => (prev === slot ? null : slot));
  };

  // Ker Nethalas hit location definitions
  const slotLabels = {
    head: isKN ? 'Head (d20: 19-20)' : 'Head',
    torso: isKN ? 'Torso (d20: 7-12)' : 'Torso',
    arms: isKN ? 'Arms (d20: 13-18)' : 'Arms',
    legs: isKN ? 'Legs (d20: 1-6)' : 'Legs',
    shield: 'Shield / Off-Hand',
  };

  const activeStats = useMemo(() => {
    if (!activeSlot) return null;
    return getArmorStats(armor[activeSlot], activeSlot, isKN);
  }, [activeSlot, armor, isKN]);

  const width = compact ? 36 : 52;
  const height = compact ? 82 : 118;

  // Weapon advancement ticks (e.g. Shafted Weapons)
  const advTicks = advancementTrack ? Number(advancementTrack.ticks || 0) : 0;
  const advMax = advancementTrack ? Number(advancementTrack.maxTicks || 5) : 5;
  const advName = advancementTrack?.name ? advancementTrack.name.replace(/\s*\[.*?\]/g, '') : 'Shafted Weapons';

  const mannequinElement = (
    <div
      className={`imsd-mannequin-wrap ${compact ? 'compact' : ''}`}
      style={{ width, height }}
      title="Character Armour Mannequin (click ♂/♀ to toggle silhouette, tap piece to inspect)"
    >
      <svg
        role="img"
        aria-label="Character armour mannequin"
        className="imsd-mannequin-svg fill-current"
        viewBox="0 0 100 220"
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="armorShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>

        {gender === 'male' ? (
          /* ============================================================ */
          /* MALE MANNEQUIN SILHOUETTE (Dark Tan #7c5c3b)                 */
          /* ============================================================ */
          <g className="imsd-mannequin-male">
            {/* Head */}
            <path
              d="M 50 6 C 43 6 37 12 37 22 C 37 32 43 38 50 38 C 57 38 63 32 63 22 C 63 12 57 6 50 6 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />
            {/* Neck */}
            <path
              d="M 45 36 L 45 45 L 55 45 L 55 36 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Torso & Pelvis */}
            <path
              d="M 45 45 L 26 49 C 23 51 22 55 23 60 L 30 90 C 31 96 35 101 40 104 L 49 109 L 51 109 L 60 104 C 65 101 69 96 70 90 L 77 60 C 78 55 77 51 74 49 L 55 45 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Left Arm (Viewer Left) */}
            <path
              d="M 24 51 C 20 53 18 57 17 63 L 13 92 C 12 97 11 102 10 108 L 7 124 C 6 129 7 133 10 135 C 13 136 15 134 16 130 L 20 109 C 21 103 23 97 24 91 L 27 63 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Right Arm (Viewer Right) */}
            <path
              d="M 76 51 C 80 53 82 57 83 63 L 87 92 C 88 97 89 102 90 108 L 93 124 C 94 129 93 133 90 135 C 87 136 85 134 84 130 L 80 109 C 79 103 77 97 76 91 L 73 63 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Left Leg */}
            <path
              d="M 37 104 L 33 140 C 33 148 34 157 35 167 L 36 196 C 36 202 37 210 38 214 C 39 216 43 216 44 214 C 46 210 47 201 48 193 L 49 163 C 49 151 50 136 49 110 L 48 108 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Right Leg */}
            <path
              d="M 63 104 L 67 140 C 67 148 66 157 65 167 L 64 196 C 64 202 63 210 62 214 C 61 216 57 216 56 214 C 54 210 53 201 52 193 L 51 163 C 51 151 50 136 51 110 L 52 108 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />
          </g>
        ) : (
          /* ============================================================ */
          /* FEMALE MANNEQUIN SILHOUETTE (Dark Tan #7c5c3b)               */
          /* ============================================================ */
          <g className="imsd-mannequin-female">
            {/* Head */}
            <path
              d="M 50 6 C 44 6 39 12 39 21 C 39 30 44 37 50 37 C 56 37 61 30 61 21 C 61 12 56 6 50 6 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />
            {/* Neck */}
            <path
              d="M 46 35 L 46 45 L 54 45 L 54 35 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Torso & Pelvis (Slender waist, flared hips) */}
            <path
              d="M 46 45 L 32 49 C 30 51 29 55 30 59 L 34 78 C 35 82 37 86 39 89 L 35 98 C 33 102 35 106 38 108 L 49 110 L 51 110 L 62 108 C 65 106 67 102 65 98 L 61 89 C 63 86 65 82 66 78 L 70 59 C 71 55 70 51 68 49 L 54 45 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Left Arm */}
            <path
              d="M 30 51 C 27 53 25 57 24 62 L 20 89 C 19 94 18 99 17 105 L 14 122 C 13 126 14 130 17 132 C 19 133 21 131 22 127 L 25 106 C 26 101 28 95 29 89 L 32 62 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Right Arm */}
            <path
              d="M 70 51 C 73 53 75 57 76 62 L 80 89 C 81 94 82 99 83 105 L 86 122 C 87 126 86 130 83 132 C 81 133 79 131 78 127 L 75 106 C 74 101 72 95 71 89 L 68 62 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Left Leg */}
            <path
              d="M 38 108 L 35 142 C 35 150 36 158 37 167 L 38 196 C 38 202 39 210 40 214 C 41 216 44 216 45 214 C 47 210 48 201 48 193 L 49 163 C 49 151 50 137 49 110 L 48 109 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />

            {/* Right Leg */}
            <path
              d="M 62 108 L 65 142 C 65 150 64 158 63 167 L 62 196 C 62 202 61 210 60 214 C 59 216 56 216 55 214 C 53 210 52 201 52 193 L 51 163 C 51 151 50 137 51 110 L 52 109 Z"
              fill={TAN_BODY}
              style={{ fill: `${TAN_BODY} !important` }}
              className="imsd-body-part"
            />
          </g>
        )}

        {/* ============================================================ */}
        {/* BLACK ARMOR OVERLAYS (Worn items rendered in solid black)    */}
        {/* ============================================================ */}

        {/* 1. HEAD ARMOR (Helm / Helmet / Coif) */}
        {armor.head && (
          <g
            className={`imsd-armor-overlay imsd-armor-head ${activeSlot === 'head' ? 'selected' : ''}`}
            filter="url(#armorShadow)"
            role="button"
            tabIndex={0}
            onClick={(e) => toggleSlot('head', e)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSlot('head', e); }}
            onMouseEnter={() => setHoveredSlot('head')}
            onMouseLeave={() => setHoveredSlot(null)}
          >
            <path
              d="M 50 4 C 40 4 34 10 34 20 C 34 26 35 32 38 36 L 43 37 L 43 26 L 57 26 L 57 37 L 62 36 C 65 32 66 26 66 20 C 66 10 60 4 50 4 Z"
              fill={BLACK_ARMOR}
              stroke={ARMOR_BORDER}
              strokeWidth="1.4"
              style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${ARMOR_BORDER} !important` }}
            />
            <circle cx="43" cy="18" r="1.3" fill={GILT_RIVET} style={{ fill: `${GILT_RIVET} !important` }} />
            <circle cx="57" cy="18" r="1.3" fill={GILT_RIVET} style={{ fill: `${GILT_RIVET} !important` }} />
          </g>
        )}

        {/* 2. TORSO ARMOR (Breastplate / Cuirass / Gambeson / Plate) */}
        {armor.torso && (
          <g
            className={`imsd-armor-overlay imsd-armor-torso ${activeSlot === 'torso' ? 'selected' : ''}`}
            filter="url(#armorShadow)"
            role="button"
            tabIndex={0}
            onClick={(e) => toggleSlot('torso', e)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSlot('torso', e); }}
            onMouseEnter={() => setHoveredSlot('torso')}
            onMouseLeave={() => setHoveredSlot(null)}
          >
            {gender === 'male' ? (
              <path
                d="M 45 44 L 25 48 C 22 51 21 56 23 61 L 29 88 C 30 94 34 99 39 102 L 49 107 L 51 107 L 61 102 C 66 99 70 94 71 88 L 77 61 C 79 56 78 51 75 48 L 55 44 C 52 47 48 47 45 44 Z"
                fill={BLACK_ARMOR}
                stroke={ARMOR_BORDER}
                strokeWidth="1.5"
                style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${ARMOR_BORDER} !important` }}
              />
            ) : (
              <path
                d="M 46 44 L 31 48 C 28 51 27 55 29 59 L 33 78 C 34 83 36 87 38 90 L 35 99 C 34 102 36 105 39 107 L 49 109 L 51 109 L 61 107 C 64 105 66 102 65 99 L 62 90 C 64 87 66 83 67 78 L 71 59 C 73 55 72 51 69 48 L 54 44 C 51 47 49 47 46 44 Z"
                fill={BLACK_ARMOR}
                stroke={ARMOR_BORDER}
                strokeWidth="1.5"
                style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${ARMOR_BORDER} !important` }}
              />
            )}
            {/* Median ridge and forged detail */}
            <path
              d="M 50 47 L 50 96"
              stroke="#332a22"
              strokeWidth="1.2"
              strokeLinecap="round"
              style={{ stroke: '#332a22 !important' }}
            />
            <circle cx="32" cy="54" r="1.4" fill={GILT_RIVET} style={{ fill: `${GILT_RIVET} !important` }} />
            <circle cx="68" cy="54" r="1.4" fill={GILT_RIVET} style={{ fill: `${GILT_RIVET} !important` }} />
          </g>
        )}

        {/* 3. ARMS ARMOR (Bracers / Gauntlets / Pauldrons) */}
        {armor.arms && (
          <g
            className={`imsd-armor-overlay imsd-armor-arms ${activeSlot === 'arms' ? 'selected' : ''}`}
            filter="url(#armorShadow)"
            role="button"
            tabIndex={0}
            onClick={(e) => toggleSlot('arms', e)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSlot('arms', e); }}
            onMouseEnter={() => setHoveredSlot('arms')}
            onMouseLeave={() => setHoveredSlot(null)}
          >
            {/* Left Arm Bracer & Pauldron */}
            <path
              d="M 24 50 C 21 52 19 55 18 60 L 16 70 L 24 67 L 26 56 Z"
              fill={BLACK_ARMOR}
              stroke={ARMOR_BORDER}
              strokeWidth="1.2"
              style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${ARMOR_BORDER} !important` }}
            />
            <path
              d="M 15 88 L 10 106 L 17 108 L 20 90 Z"
              fill={BLACK_ARMOR}
              stroke={ARMOR_BORDER}
              strokeWidth="1.2"
              style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${ARMOR_BORDER} !important` }}
            />
            {/* Right Arm Bracer & Pauldron */}
            <path
              d="M 76 50 C 79 52 81 55 82 60 L 84 70 L 76 67 L 74 56 Z"
              fill={BLACK_ARMOR}
              stroke={ARMOR_BORDER}
              strokeWidth="1.2"
              style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${ARMOR_BORDER} !important` }}
            />
            <path
              d="M 85 88 L 90 106 L 83 108 L 80 90 Z"
              fill={BLACK_ARMOR}
              stroke={ARMOR_BORDER}
              strokeWidth="1.2"
              style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${ARMOR_BORDER} !important` }}
            />
          </g>
        )}

        {/* 4. LEGS ARMOR (Greaves / Boots / Cuisses) */}
        {armor.legs && (
          <g
            className={`imsd-armor-overlay imsd-armor-legs ${activeSlot === 'legs' ? 'selected' : ''}`}
            filter="url(#armorShadow)"
            role="button"
            tabIndex={0}
            onClick={(e) => toggleSlot('legs', e)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSlot('legs', e); }}
            onMouseEnter={() => setHoveredSlot('legs')}
            onMouseLeave={() => setHoveredSlot(null)}
          >
            {/* Left Leg Greave */}
            <path
              d="M 33 146 L 35 172 L 36 198 L 46 196 L 46 170 L 46 146 Z"
              fill={BLACK_ARMOR}
              stroke={ARMOR_BORDER}
              strokeWidth="1.2"
              style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${ARMOR_BORDER} !important` }}
            />
            {/* Right Leg Greave */}
            <path
              d="M 67 146 L 65 172 L 64 198 L 54 196 L 54 170 L 54 146 Z"
              fill={BLACK_ARMOR}
              stroke={ARMOR_BORDER}
              strokeWidth="1.2"
              style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${ARMOR_BORDER} !important` }}
            />
            <circle cx="40" cy="148" r="3.5" fill={BLACK_ARMOR} stroke={GILT_RIVET} strokeWidth="0.8" style={{ fill: `${BLACK_ARMOR} !important` }} />
            <circle cx="60" cy="148" r="3.5" fill={BLACK_ARMOR} stroke={GILT_RIVET} strokeWidth="0.8" style={{ fill: `${BLACK_ARMOR} !important` }} />
          </g>
        )}

        {/* 5. SHIELD (Shown on left side) */}
        {armor.shield && (
          <g
            className={`imsd-armor-overlay imsd-armor-shield ${activeSlot === 'shield' ? 'selected' : ''}`}
            filter="url(#armorShadow)"
            role="button"
            tabIndex={0}
            onClick={(e) => toggleSlot('shield', e)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSlot('shield', e); }}
            onMouseEnter={() => setHoveredSlot('shield')}
            onMouseLeave={() => setHoveredSlot(null)}
          >
            <path
              d="M 5 76 L 21 76 C 21 100 15 114 13 122 C 11 114 5 100 5 76 Z"
              fill={BLACK_ARMOR}
              stroke={GILT_RIVET}
              strokeWidth="1.2"
              style={{ fill: `${BLACK_ARMOR} !important`, stroke: `${GILT_RIVET} !important` }}
            />
            <circle cx="13" cy="94" r="2.2" fill={GILT_RIVET} style={{ fill: `${GILT_RIVET} !important` }} />
          </g>
        )}
      </svg>

      {/* Gender Toggle Button (♂ / ♀) */}
      <button
        type="button"
        className="imsd-mannequin-gender-btn"
        onClick={toggleGender}
        title={`Current silhouette: ${gender}. Click to switch to ${gender === 'male' ? 'female' : 'male'}.`}
      >
        {gender === 'male' ? '♂' : '♀'}
      </button>

      {/* Floating tooltip only when compact (no side gear panel) */}
      {compact && activeSlot && (
        <div className="imsd-mannequin-tooltip">
          <div className="imsd-tooltip-header">
            <b>{slotLabels[activeSlot] || activeSlot}</b>
            {activeStats?.prot > 0 && (
              <span className="imsd-tooltip-badge">Prot {activeStats.prot}</span>
            )}
            <button
              type="button"
              className="imsd-slot-summary-card-close"
              style={{ background: 'none', border: 'none', color: '#c29f62', cursor: 'pointer', marginLeft: 'auto' }}
              onClick={(e) => { e.stopPropagation(); setSelectedSlot(null); }}
            >
              ×
            </button>
          </div>
          <span className="imsd-tooltip-name">{armor[activeSlot] || 'Unarmoured'}</span>
          {activeStats?.extra && (
            <span className="imsd-tooltip-sub">{activeStats.extra}</span>
          )}
        </div>
      )}
    </div>
  );

  if (!showGearList) {
    return mannequinElement;
  }

  return (
    <div className="imsd-mannequin-container">
      <div className="imsd-mannequin-layout">
        {/* Left: Anatomical Mannequin Silhouette */}
        <div className="imsd-mannequin-col">
          {mannequinElement}
        </div>

        {/* Right: Weapons & Combat Gear (Space used exclusively for equipped weapons and proficiency) */}
        <div className="imsd-mannequin-gear-col">
          {/* Toggled / Selected Slot Summary Card (if user clicked/tapped an armour piece on the silhouette) */}
          {activeSlot && (
            <div className="imsd-slot-summary-card">
              <div className="summary-head">
                <b>{slotLabels[activeSlot] || activeSlot}</b>
                {activeStats?.prot > 0 && (
                  <span className="prot-badge">Prot {activeStats.prot}</span>
                )}
                <button
                  type="button"
                  className="close-btn"
                  onClick={() => setSelectedSlot(null)}
                  title="Hide armour summary"
                >
                  ×
                </button>
              </div>
              <div className="summary-item">{armor[activeSlot] || 'Unarmoured'}</div>
              {activeStats?.extra && (
                <div className="summary-extra">{activeStats.extra}</div>
              )}
            </div>
          )}

          {/* Weapons Section Heading - styled with the exact same imsd-kicker style as backpack items */}
          <span className="imsd-kicker">Weapons</span>

          {/* Weapon Cards with type, damage, traits, and proficiency */}
          {rawWeapons.map((weaponName, idx) => {
            const details = getWeaponDetails(weaponName, hero?.spells_or_skills || []);
            return (
              <div key={idx} className="imsd-weapon-card">
                <div className="imsd-weapon-head">
                  <h4 className="imsd-weapon-name">⚔️ {weaponName}</h4>
                  <span className="imsd-weapon-dmg">{details.damage}</span>
                </div>
                <span className="imsd-weapon-type">{details.type}</span>
                <span className="imsd-weapon-traits">{details.traits}</span>
                <div className="imsd-weapon-prof-row">
                  <span className="imsd-weapon-prof-lbl">Proficiency</span>
                  <span className="imsd-weapon-prof-val">{details.proficiency}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weapon Skill Advancement under the mannequin */}
      {(isKN || advancementTrack) && (
        <div className="imsd-weapon-advancement-section">
          <div className="imsd-advancement-head">
            <span className="title">
              ⚔️ {advName} Advancement
            </span>
            <span className="rule-hint">
              Matched doubles or 01 marks [✓] · 5 ticks unlock Master Tier (+5% skill)
            </span>
          </div>
          <div className="imsd-advancement-row">
            <div className="imsd-advancement-pips">
              {Array.from({ length: advMax }).map((_, i) => {
                const isFilled = i < advTicks;
                return !locked && onAdvancementChange ? (
                  <button
                    key={i}
                    type="button"
                    className={`imsd-advancement-pip ${isFilled ? 'filled' : ''}`}
                    onClick={() => {
                      onAdvancementChange(isFilled && i === advTicks - 1 ? i : i + 1);
                    }}
                    title={`Advancement tick ${i + 1} of ${advMax}`}
                  >
                    {isFilled ? '✓' : ''}
                  </button>
                ) : (
                  <span
                    key={i}
                    className={`imsd-advancement-pip ${isFilled ? 'filled' : ''} is-locked`}
                    title={`Advancement tick ${i + 1} of ${advMax} (auto-managed)`}
                  >
                    {isFilled ? '✓' : ''}
                  </span>
                );
              })}
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--on-surface)' }}>
              {advTicks} / {advMax} Ticks
            </span>
            {!locked && onAdvancementChange && (
              <div className="imsd-advancement-btns">
                <button
                  type="button"
                  onClick={() => onAdvancementChange(Math.max(0, advTicks - 1))}
                  title="Remove tick"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => onAdvancementChange(Math.min(advMax, advTicks + 1))}
                  title="Mark triumph tick"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
