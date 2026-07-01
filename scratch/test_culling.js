// Unit test for MeshCanvas culling logic simulation

const testCulling = (node, view, isMovingMesh, windowSize) => {
  const worldCX = (windowSize.width / 2 - view.x) / view.scale;
  const worldCY = (windowSize.height / 2 - view.y) / view.scale;
  const dist = Math.sqrt(Math.pow(node.x - worldCX, 2) + Math.pow(node.y - worldCY, 2));

  const paddingMultiplier = isMovingMesh ? 10.0 : 1.8;
  const visibleRange = (Math.max(windowSize.width, windowSize.height) / view.scale) * paddingMultiplier;

  return dist <= visibleRange;
};

// Running test cases
const runTests = () => {
  const windowSize = { width: 1920, height: 1080 };
  const parent = { id: 'parent', x: 2000, y: 2000 };
  const child = { id: 'child', x: 3000, y: 3000 };

  const staleView = { x: -50, y: -331, scale: 0.36 }; 

  console.log("--- TEST CASE 1: Node Visibility via Set check ---");
  const visibleNodeIds = new Set();
  if (testCulling(parent, staleView, false, windowSize)) visibleNodeIds.add(parent.id);
  if (testCulling(child, staleView, false, windowSize)) visibleNodeIds.add(child.id);

  console.log(`Parent visible: ${visibleNodeIds.has(parent.id)}`);
  console.log(`Child visible: ${visibleNodeIds.has(child.id)}`);

  console.log("--- TEST CASE 2: Connection Line Culling ---");
  // A link is visible if at least one endpoint is visible
  const isLinkVisible = visibleNodeIds.has(parent.id) || visibleNodeIds.has(child.id);
  console.log(`Link visible: ${isLinkVisible}`);

  if (isLinkVisible) {
    console.log("SUCCESS: Viewport culling and link culling calculations evaluate correctly.");
  } else {
    console.error("FAILURE: Line culling failed.");
    process.exit(1);
  }
};

runTests();
