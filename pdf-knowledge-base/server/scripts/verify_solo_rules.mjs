import assert from 'assert';
import { getGames, isSoloGame, describeCollectionForIms } from '../services/boardgamesService.js';

console.log('Testing 4 Solo Game Rules...');

// 1. 1 player only
assert.strictEqual(isSoloGame({ players: '1', minPlayers: 1, maxPlayers: 1 }), true, 'Rule 1: 1 player only should be solo');
assert.strictEqual(isSoloGame({ minPlayers: 1, maxPlayers: 1 }), true, 'Rule 1: min 1 and max 1 should be solo');

// 2. 1 marked in player count as minimum
assert.strictEqual(isSoloGame({ players: '1-4', minPlayers: 1, maxPlayers: 4 }), true, 'Rule 2: 1-4 should be solo');
assert.strictEqual(isSoloGame({ minPlayers: 1, maxPlayers: 5 }), true, 'Rule 2: minPlayers 1 should be solo');

// 3. 1 listed in community player count minimum
assert.strictEqual(isSoloGame({ players: '2-4', minPlayers: 2, maxPlayers: 4, communityMinPlayers: 1 }), true, 'Rule 3: communityMinPlayers 1 should be solo');
assert.strictEqual(isSoloGame({ players: '2-4', minPlayers: 2, maxPlayers: 4, communityPlayers: [1, 2, 3, 4] }), true, 'Rule 3: communityPlayers [1, 2, 3, 4] should be solo');
assert.strictEqual(isSoloGame({ players: '2-4', minPlayers: 2, maxPlayers: 4, bggRecPlayers: '1,2,3,4' }), true, 'Rule 3: bggRecPlayers "1,2,3,4" should be solo');

// 4. Marked as solo (mechanics, categories, tags, or name)
assert.strictEqual(isSoloGame({ players: '2-4', minPlayers: 2, maxPlayers: 4, mechanics: ['Solo / Solitaire Game'] }), true, 'Rule 4: Solo / Solitaire Game mechanic should be solo');
assert.strictEqual(isSoloGame({ players: '2-4', minPlayers: 2, maxPlayers: 4, categories: ['Solitaire'] }), true, 'Rule 4: Solitaire category should be solo');
assert.strictEqual(isSoloGame({ name: 'Great Western Trail (Solo Mode)', players: '2-4', minPlayers: 2, maxPlayers: 4 }), true, 'Rule 4: Solo in name should be solo');

// Non-solo check
assert.strictEqual(isSoloGame({ players: '2-2', minPlayers: 2, maxPlayers: 2, communityMinPlayers: 2 }), false, '2-player game without solo attributes should not be solo');

// Real collection check
const data = getGames();
console.log(`Total games in collection: ${data.games.length}`);
const soloGames = data.games.filter(g => g.solo);
console.log(`Total solo-capable games: ${soloGames.length}`);

// Check specific games
const jumpDrive = data.games.find(g => g.name === 'Jump Drive');
assert.ok(jumpDrive, 'Jump Drive found');
assert.strictEqual(jumpDrive.solo, true, 'Jump Drive should be solo (community min 1)');

const omegaCentauri = data.games.find(g => g.name === 'Omega Centauri');
assert.ok(omegaCentauri, 'Omega Centauri found');
assert.strictEqual(omegaCentauri.solo, true, 'Omega Centauri should be solo (community min 1)');

const tussieMussie = data.games.find(g => g.name === 'Tussie Mussie');
assert.ok(tussieMussie, 'Tussie Mussie found');
assert.strictEqual(tussieMussie.solo, true, 'Tussie Mussie should be solo (community min 1)');

const pandemic = data.games.find(g => g.name === 'Pandemic');
assert.ok(pandemic, 'Pandemic found');
assert.strictEqual(pandemic.solo, true, 'Pandemic should be solo (marked as solo)');

const chess = data.games.find(g => g.name === 'Chess');
assert.ok(chess, 'Chess found');
assert.strictEqual(chess.solo, false, 'Chess should NOT be solo');

// Test Ims description filter
const imsSolo = describeCollectionForIms({ solo: true });
assert.strictEqual(imsSolo.matching, soloGames.length, 'Ims solo filter count matches collection solo count');

const ims1Player = describeCollectionForIms({ players: 1 });
assert.ok(ims1Player.matching >= soloGames.length, 'Ims 1-player filter covers solo games');

console.log('All Solo Game Rule tests PASSED successfully!');
