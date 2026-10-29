// Real 3D dice in a tray (25 Oct 2026, Simon: "the dice rolling is uninspired, can you create real 3D dice that roll in
// a tray?"). three.js draws them, cannon-es throws them: each die is a true polyhedron (d4, d6, d8, d10, d12, d20 and the
// tens die of a percentile pair) with its numbers painted on the faces, opposite faces adding up the way real dice do.
// They're thrown from the near edge, tumble, knock into each other and the tray's rim, and settle; the result is read
// from the face that ends up on top (the top corner of a d4), so what you see is what you rolled. A die left balanced on
// an edge gets a nudge. Every knock clicks through the D&D audio engine.
//
//   const tray = useRef(); <DiceTray ref={tray} dark={dark} />;  const faces = await tray.current.roll(['d20', 'd20']);
//   faces: the number showing on each die, in order (d10: 0-9, the tens die: 0-90; the caller turns those into results)
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ---- the dice: shape, size and colours -------------------------------------------------------------------------------
const SETS = {
  garnet: { body: '#7a1f2b', ink: '#f3d27a', edge: '#4a0f18' },
  ivory: { body: '#efe6d2', ink: '#2a2118', edge: '#cbbd9f' },
  teal: { body: '#15524f', ink: '#f2e7c9', edge: '#0b3331' },
  obsidian: { body: '#1d1b22', ink: '#e9c46a', edge: '#0c0b0f' },
};
const SET_FOR = { d4: 'teal', d6: 'ivory', d8: 'teal', d10: 'obsidian', d100t: 'obsidian', d12: 'ivory', d20: 'garnet' };

function d10Triangles(r) {
  // Authentic pentagonal trapezohedron with realistic height-to-diameter ratio (1.62:1)
  const R = 0.82, a = 0.14, h = a * (1 + Math.cos(Math.PI / 5)) / (1 - Math.cos(Math.PI / 5));
  const ring = Array.from({ length: 10 }, (_, i) => new THREE.Vector3(R * Math.cos((i * Math.PI) / 5), i % 2 ? -a : a, R * Math.sin((i * Math.PI) / 5)));
  const T = new THREE.Vector3(0, h, 0), B = new THREE.Vector3(0, -h, 0);
  const tris = [];
  for (let k = 0; k < 5; k++) {
    const u0 = ring[2 * k], l1 = ring[2 * k + 1], u2 = ring[(2 * k + 2) % 10], l3 = ring[(2 * k + 3) % 10];
    tris.push([T, u0, l1], [T, l1, u2]); // the top kite T-u0-l1-u2
    tris.push([B, l1, u2], [B, u2, l3]); // the bottom kite B-l1-u2-l3
  }
  const max = Math.max(h, R);
  return tris.map((t) => t.map((v) => v.clone().multiplyScalar(r / max)));
}

function trianglesOf(kind, r) {
  if (kind === 'd10' || kind === 'd100t') return d10Triangles(r * 1.05);
  const g = kind === 'd4' ? new THREE.TetrahedronGeometry(r * 1.15)
    : kind === 'd6' ? new THREE.BoxGeometry(r * 1.15, r * 1.15, r * 1.15)
      : kind === 'd8' ? new THREE.OctahedronGeometry(r)
        : kind === 'd12' ? new THREE.DodecahedronGeometry(r * 1.02)
          : new THREE.IcosahedronGeometry(r * 1.05);
  const p = (g.index ? g.toNonIndexed() : g).getAttribute('position');
  const out = [];
  for (let i = 0; i < p.count; i += 3) out.push([0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, i + j)));
  g.dispose();
  return out;
}

// triangles -> the die's flat faces (coplanar triangles merged), each an outward-facing polygon with its points in order
function facesOf(tris) {
  const verts = [], vkey = new Map();
  const vid = (v) => { const k = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`; if (!vkey.has(k)) { vkey.set(k, verts.length); verts.push(v.clone()); } return vkey.get(k); };
  const groups = new Map();
  for (const [a, b, c] of tris) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const centre = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    if (n.dot(centre) < 0) n.negate(); // outward
    // Snap near-zero values to 0 to prevent "-0.00" vs "0.00" key splitting on d10 kite faces
    const snap = (v) => (Math.abs(v) < 1e-4 ? 0 : Number(v.toFixed(3)));
    const k = `${snap(n.x)},${snap(n.y)},${snap(n.z)}`;
    if (!groups.has(k)) groups.set(k, { normal: n, ids: new Set() });
    [a, b, c].forEach((v) => groups.get(k).ids.add(vid(v)));
  }
  const faces = [...groups.values()].map(({ normal, ids }) => {
    const pts = [...ids];
    const centre = pts.reduce((s, i) => s.add(verts[i]), new THREE.Vector3()).divideScalar(pts.length);
    const u = new THREE.Vector3().subVectors(verts[pts[0]], centre).normalize();
    const w = new THREE.Vector3().crossVectors(normal, u);
    pts.sort((i, j) => {
      const pi = new THREE.Vector3().subVectors(verts[i], centre), pj = new THREE.Vector3().subVectors(verts[j], centre);
      return Math.atan2(pi.dot(w), pi.dot(u)) - Math.atan2(pj.dot(w), pj.dot(u));
    });
    return { normal, centre, ids: pts };
  });
  return { verts, faces };
}

// the numbers: opposite faces add up (1+20, 2+19 ...; a d10's 0+9); a d4's numbers sit at its corners
function numberFaces(kind, faces) {
  const n = faces.length;
  const top = kind === 'd10' || kind === 'd100t' ? 9 : n + 1;
  const low = kind === 'd10' || kind === 'd100t' ? 0 : 1;
  const free = new Set(faces.map((_, i) => i));
  let k = low;
  while (free.size) {
    const f = free.values().next().value;
    free.delete(f);
    let g = null, best = 2;
    for (const j of free) { const d = faces[f].normal.dot(faces[j].normal); if (d < best) { best = d; g = j; } }
    faces[f].value = k;
    if (g != null) { free.delete(g); faces[g].value = top - k + (low === 0 ? 0 : 0); }
    k++;
  }
  if (kind === 'd100t') faces.forEach((f) => { f.value *= 10; });
}

const label = (kind, v) => (kind === 'd100t' ? (v === 0 ? '00' : String(v)) : String(v));

function faceTexture(kind, face, cornerUv, set) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = set.body; g.fillRect(0, 0, S, S);
  // a soft sheen towards the centre, like resin
  const grad = g.createRadialGradient(S * 0.42, S * 0.38, 4, S / 2, S / 2, S * 0.7);
  grad.addColorStop(0, 'rgba(255,255,255,0.16)'); grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  g.fillStyle = set.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const font = (px) => `800 ${px}px Georgia, 'Times New Roman', serif`;
  if (kind === 'd4') {
    // each corner carries the number of the point it's nearest
    face.cornerValues.forEach((v, i) => {
      const [u, w] = cornerUv[i];
      const x = (0.5 + (u - 0.5) * 0.58) * S, y = (1 - (0.5 + (w - 0.5) * 0.58)) * S;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(x - S / 2, -(y - S / 2)));
      g.font = font(64); g.fillText(String(v), 0, 0); g.restore();
    });
  } else {
    const text = label(kind, face.value);
    const px = { d6: 120, d8: 96, d10: 88, d100t: 68, d12: 92, d20: 78 }[kind] || 90;
    g.font = font(px);
    const y = kind === 'd8' || kind === 'd20' ? S * 0.56 : kind === 'd10' || kind === 'd100t' ? S * 0.55 : S / 2;
    g.fillText(text, S / 2, y);
    if (text === '6' || text === '9') g.fillRect(S / 2 - px * 0.22, y + px * 0.44, px * 0.44, Math.max(5, px * 0.06)); // 6 and 9 told apart
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const RADIUS = { d4: 1.2, d6: 1.1, d8: 1.12, d10: 1.1, d100t: 1.1, d12: 1.12, d20: 1.2 };

function buildDie(kind) {
  const r = RADIUS[kind] || 0.9;
  const { verts, faces } = facesOf(trianglesOf(kind, r));
  const set = SETS[SET_FOR[kind] || 'ivory'];
  if (kind === 'd4') verts.forEach((v, i) => { v.value = i + 1; });
  else numberFaces(kind, faces);

  const pos = [], uv = [], groups = [];
  const materials = [];
  faces.forEach((f, fi) => {
    // Determine proper right-handed (u, w) coordinate frame on each face so numbers stand upright
    let u, w;
    if (kind === 'd10' || kind === 'd100t') {
      // Real d10 / percentile dice: the top of the number points directly toward the kite's sharp apex (pole)
      let apex = verts[f.ids[0]];
      for (const id of f.ids) {
        if (Math.abs(verts[id].y) > Math.abs(apex.y)) apex = verts[id];
      }
      w = new THREE.Vector3().subVectors(apex, f.centre).projectOnPlane(f.normal).normalize();
      u = new THREE.Vector3().crossVectors(w, f.normal).normalize();
    } else if (kind === 'd6') {
      const upRef = Math.abs(f.normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, -Math.sign(f.normal.y));
      w = upRef.projectOnPlane(f.normal).normalize();
      u = new THREE.Vector3().crossVectors(w, f.normal).normalize();
    } else if (kind === 'd8' || kind === 'd20' || kind === 'd12') {
      const upRef = Math.abs(f.normal.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, -1);
      const projUp = upRef.projectOnPlane(f.normal).normalize();
      let bestV = verts[f.ids[0]], bestDot = -2;
      for (const id of f.ids) {
        const vDir = new THREE.Vector3().subVectors(verts[id], f.centre).normalize();
        const dot = vDir.dot(projUp);
        if (dot > bestDot) { bestDot = dot; bestV = verts[id]; }
      }
      w = new THREE.Vector3().subVectors(bestV, f.centre).projectOnPlane(f.normal).normalize();
      u = new THREE.Vector3().crossVectors(w, f.normal).normalize();
    } else {
      u = new THREE.Vector3().subVectors(verts[f.ids[0]], f.centre).normalize();
      w = new THREE.Vector3().crossVectors(f.normal, u);
    }
    const flat = f.ids.map((i) => { const p = new THREE.Vector3().subVectors(verts[i], f.centre); return [p.dot(u), p.dot(w)]; });
    const R = Math.max(...flat.map(([x, y]) => Math.hypot(x, y))) * 1.02;
    const uvs = flat.map(([x, y]) => [0.5 + x / (2 * R), 0.5 + y / (2 * R)]);
    if (kind === 'd4') f.cornerValues = f.ids.map((i) => verts[i].value);
    const start = pos.length / 3;
    for (let k = 1; k < f.ids.length - 1; k++) {
      for (const j of [0, k, k + 1]) { const v = verts[f.ids[j]]; pos.push(v.x, v.y, v.z); uv.push(...uvs[j]); }
    }
    groups.push([start, (f.ids.length - 2) * 3, fi]);
    materials.push(new THREE.MeshPhysicalMaterial({ map: faceTexture(kind, f, uvs, set), roughness: 0.38, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.25 }));
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  groups.forEach(([s, n, m]) => geo.addGroup(s, n, m));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, materials);
  mesh.castShadow = true; mesh.receiveShadow = true;
  // the rim: dark edges drawn over the faces so the shape reads at a glance
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 10), new THREE.LineBasicMaterial({ color: set.edge, transparent: true, opacity: 0.55 }));
  mesh.add(edges);

  const shape = new CANNON.ConvexPolyhedron({ vertices: verts.map((v) => new CANNON.Vec3(v.x, v.y, v.z)), faces: faces.map((f) => f.ids) });
  return { kind, mesh, shape, faces, verts };
}

// which number is showing: the face pointing up (a d4: the corner pointing up)
function readDie(die, quat) {
  const q = new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w);
  if (die.kind === 'd4') {
    let best = null, y = -Infinity;
    for (const v of die.verts) { const wy = v.clone().applyQuaternion(q).y; if (wy > y) { y = wy; best = v.value; } }
    return { value: best, flat: 1 };
  }
  let best = null, dot = -2;
  for (const f of die.faces) { const d = f.normal.clone().applyQuaternion(q).y; if (d > dot) { dot = d; best = f.value; } }
  return { value: best, flat: dot };
}

// ---- the tray -------------------------------------------------------------------------------------------------------
function feltTexture(dark) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = dark ? '#173b31' : '#25594a'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 22; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#8a5a30'); grad.addColorStop(0.5, '#6b4223'); grad.addColorStop(1, '#4e2f17');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,20,5' : '160,110,60'},${0.08 + Math.random() * 0.12})`;
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath();
    const y = Math.random() * 64;
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 3 + (Math.random() - 0.5) * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DiceTray = forwardRef(function DiceTray({ dark = false, height = 300, onKnock, className = '', onPaper = false }, ref) {
  const host = useRef(null);
  const api = useRef(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: onPaper });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    if (!onPaper) {
      scene.background = new THREE.Color(dark ? 0x22150b : 0x3b2414);
    }
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xfff4e0, onPaper ? 0x6e5233 : 0x203028, 1.2));
    const sun = new THREE.DirectionalLight(0xfff1d6, onPaper ? 2.6 : 2.2);
    sun.position.set(-5, 14, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
    sun.shadow.radius = onPaper ? 6 : 4;
    scene.add(sun);
    const lamp = new THREE.PointLight(0xffc98a, 18, 30, 1.6); lamp.position.set(6, 7, -3); scene.add(lamp);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
    world.allowSleep = true;
    world.broadphase = new CANNON.SAPBroadphase(world);
    const diceMat = new CANNON.Material('dice'), feltMat = new CANNON.Material('felt'), rimMat = new CANNON.Material('rim');
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat, feltMat, { friction: onPaper ? 0.38 : 0.32, restitution: onPaper ? 0.22 : 0.32 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat, rimMat, { friction: 0.1, restitution: 0.55 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.15, restitution: 0.42 }));

    // the tray / rolling surface: felt floor or shadow-catcher paper, a wooden rim (hidden onPaper), invisible walls and a lid
    const trayGroup = new THREE.Group(); scene.add(trayGroup);
    const floorMat = onPaper
      ? new THREE.ShadowMaterial({ opacity: dark ? 0.45 : 0.28 })
      : new THREE.MeshStandardMaterial({ map: feltTexture(dark), roughness: 0.95 });
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMat);
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; trayGroup.add(felt);
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.5, metalness: 0.05 });
    const rims = onPaper ? [] : [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wood); m.castShadow = true; m.receiveShadow = true; trayGroup.add(m); return m; });
    const floorBody = new CANNON.Body({ mass: 0, material: feltMat, shape: new CANNON.Plane() });
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floorBody);
    const walls = [0, 1, 2, 3, 4].map(() => { const b = new CANNON.Body({ mass: 0, material: rimMat, shape: new CANNON.Plane() }); world.addBody(b); return b; });

    let W = 14, D = 8;
    const layout = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width) || el.clientWidth || 600;
      const h = Math.round(rect.height) || el.clientHeight || height;
      if (w <= 0 || h <= 0) return;
      renderer.setSize(w, h, true);
      camera.aspect = w / h;
      // Nearly straight down so dice have zero perspective stretching
      const dist = onPaper ? 16 : 15.5;
      const tilt = onPaper ? 0.05 : 0.2;
      camera.position.set(0, dist * Math.cos(tilt), dist * Math.sin(tilt)); camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      D = viewH * 0.84; W = viewH * (w / h) * 0.9;
      felt.scale.set(W, D, 1);
      const t = 1.2, hgt = 0.6;
      if (!onPaper && rims.length) {
        [[0, -D / 2 - t / 2, W + 2 * t, t], [0, D / 2 + t / 2, W + 2 * t, t], [-W / 2 - t / 2, 0, t, D], [W / 2 + t / 2, 0, t, D]].forEach(([x, z, sx, sz], i) => {
          if (rims[i]) {
            rims[i].scale.set(sx, hgt, sz); rims[i].position.set(x, hgt / 2, z);
          }
        });
      }
      // walls face inwards: far, near, left, right, then the lid
      // Constrain physics bounds to the readable parchment column so dice never fly into margins
      const boundW = onPaper ? Math.min(W, 11) : W;
      const boundD = onPaper ? Math.min(D, 6.5) : D;
      const set = (b, x, y, z, ex, ey) => { b.position.set(x, y, z); b.quaternion.setFromEuler(ex, ey, 0); };
      set(walls[0], 0, 0, -boundD / 2, 0, 0);
      set(walls[1], 0, 0, boundD / 2, 0, Math.PI);
      set(walls[2], -boundW / 2, 0, 0, 0, Math.PI / 2);
      set(walls[3], boundW / 2, 0, 0, 0, -Math.PI / 2);
      set(walls[4], 0, 9, 0, Math.PI / 2, 0);
      kick();
    };

    let dice = [];
    let running = false, frame = 0, last = 0, quiet = 0, started = 0, nudges = 0, settle = null, glow = 0;
    const clear = () => {
      dice.forEach((d) => {
        world.removeBody(d.body); scene.remove(d.mesh);
        d.mesh.geometry.dispose(); d.mesh.material.forEach((m) => { m.map?.dispose(); m.dispose(); });
        d.mesh.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
      });
      dice = [];
    };
    const draw = () => {
      dice.forEach((d) => { d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion); });
      if (glow > 0) {
        glow = Math.max(0, glow - 0.02);
        dice.forEach((d) => d.mesh.material.forEach((m) => { m.emissive?.setRGB(glow * 0.35, glow * 0.25, glow * 0.08); }));
      }
      renderer.render(scene, camera);
    };
    const loop = (t) => {
      frame = requestAnimationFrame(loop);
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
      last = t;
      if (running) {
        world.step(1 / 120, dt, 8);
        const still = dice.every((d) => d.body.sleepState === CANNON.Body.SLEEPING || (d.body.velocity.length() < 0.08 && d.body.angularVelocity.length() < 0.12));
        quiet = still ? quiet + 1 : 0;
        if (quiet > 24 || performance.now() - started > 7000) {
          const read = dice.map((d) => readDie(d, d.body.quaternion));
          const cocked = read.map((r, i) => (r.flat < 0.94 ? i : -1)).filter((i) => i >= 0);
          if (cocked.length && nudges < 3) {
            nudges++; quiet = 0;
            cocked.forEach((i) => { const b = dice[i].body; b.wakeUp(); b.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3)); b.angularVelocity.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); });
          } else {
            running = false; glow = 1;
            const done = settle; settle = null;
            done?.(read.map((r) => r.value));
          }
        }
      } else if (glow <= 0 && !idleFrames--) { cancelAnimationFrame(frame); frame = 0; last = 0; draw(); return; }
      draw();
    };
    let idleFrames = 0;
    const kick = (n = 2) => { idleFrames = Math.max(idleFrames, n); if (!frame) { last = 0; frame = requestAnimationFrame(loop); } };

    const roll = (kinds) => new Promise((resolve) => {
      clear();
      if (settle) settle(null);
      dice = kinds.map((kind, i) => {
        const d = buildDie(kind);
        const body = new CANNON.Body({ mass: 1, material: diceMat, shape: d.shape, linearDamping: 0.12, angularDamping: 0.12, allowSleep: true, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.35 });
        if (onPaper) {
          // Drop directly over the center of the scroll text with a natural tumbling roll
          const offsetX = kinds.length > 1 ? (i - (kinds.length - 1) / 2) * 2.2 : 0;
          body.position.set(offsetX + (Math.random() - 0.5) * 1.2, 4.8 + Math.random() * 0.8 + i * 0.25, (Math.random() - 0.5) * 1.0);
          body.quaternion.setFromEuler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
          body.velocity.set((Math.random() - 0.5) * 3, -4 - Math.random() * 2, (Math.random() - 0.5) * 2.5);
          body.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
        } else {
          const spread = Math.min(W * 0.3, 1.4 * kinds.length);
          body.position.set(-W / 2 + 1.2 + Math.random() * 0.8, 2.5 + Math.random() * 1.2 + i * 0.4, D / 2 - 1.3 - (kinds.length > 1 ? (i / (kinds.length - 1)) * Math.min(D - 2.6, spread) : 0) - Math.random() * 0.4);
          body.quaternion.setFromEuler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
          body.velocity.set(W * 0.9 + Math.random() * 5, -2 - Math.random() * 3, -(D * 0.5 + Math.random() * 3));
          body.angularVelocity.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
        }
        body.addEventListener('collide', (e) => {
          const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
          if (v > 1.2) onKnockRef.current?.(Math.min(1, v / 14));
        });
        world.addBody(body); scene.add(d.mesh);
        return { ...d, body };
      });
      dice.forEach((d) => d.mesh.material.forEach((m) => m.emissive?.setRGB(0, 0, 0)));
      settle = resolve; running = true; quiet = 0; nudges = 0; started = performance.now(); glow = 0;
      kick();
    });

    api.current = { roll, clear: () => { clear(); kick(); } };
    const ro = new ResizeObserver(layout);
    ro.observe(el);
    layout();
    return () => {
      ro.disconnect(); cancelAnimationFrame(frame); frame = 0;
      if (settle) settle(null);
      clear();
      felt.geometry.dispose(); felt.material.map?.dispose(); felt.material.dispose();
      rims.forEach((m) => m.geometry.dispose()); wood.map?.dispose(); wood.dispose();
      renderer.dispose(); renderer.domElement.remove();
      api.current = null;
    };
  }, [dark, height, onPaper]);

  const onKnockRef = useRef(onKnock);
  onKnockRef.current = onKnock;

  useImperativeHandle(ref, () => ({
    roll: (kinds) => (api.current ? api.current.roll(kinds) : Promise.resolve(null)),
    clear: () => api.current?.clear(),
  }), []);

  return <div ref={host} className={`imsd-tray ${className}`} style={{ height }} aria-hidden="true" />;
});

export default DiceTray;
