import { getSpatialGraph } from './server/services/graphService.js';

async function test() {
  try {
    console.log('Testing getSpatialGraph(1)...');
    const data = await getSpatialGraph(1);
    console.log('Success! Nodes:', data.nodes.length, 'Links:', data.links.length);
  } catch (err) {
    console.error('FAILED:', err);
  }
}

test();
