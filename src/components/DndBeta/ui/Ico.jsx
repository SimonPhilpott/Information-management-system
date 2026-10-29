// The beta's icon set: small engraved-line illustrations on a 24 grid, drawn in currentColor so they take the ink or
// gilt of wherever they sit. Fills use .f (a soft tint of the same colour) for the engraved look.
import React from 'react';

const P = {
  scroll: '<path d="M6 4h11a2 2 0 0 1 2 2v1h-3"/><path d="M6 4a2 2 0 0 0-2 2v1h3V6"/><path d="M7 7v11a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1H10v1a2 2 0 0 1-2 2"/><path d="M10 10h5M10 13h5"/>',
  helm: '<path d="M5 13a7 7 0 0 1 14 0v5H5z" class="f"/><path d="M5 13a7 7 0 0 1 14 0v5H5zM12 6v12M8 13h8"/><path d="M9 16h1M14 16h1"/>',
  tome: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" class="f"/><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 21H20v-3"/><path d="M12 7l1.2 2.3 2.5.4-1.8 1.7.4 2.5L12 12.7l-2.3 1.2.4-2.5-1.8-1.7 2.5-.4z"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z" class="f"/><path d="M15.5 8.5l-2 5-5 2 2-5zM12 3.5v1.5M12 19v1.5M3.5 12H5M19 12h1.5"/>',
  door: '<path d="M6 21V5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v16" class="f"/><path d="M6 21V5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v16M4 21h16M9 7h6M9 11h6"/><circle cx="15" cy="15" r=".9" fill="currentColor"/>',
  doorq: '<path d="M6 21V5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v16M4 21h16"/><path d="M10 9.5a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1V13M12 16v.5"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" class="f"/><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
  swords: '<path d="M4 4l9 9M20 4l-9 9"/><path d="M4 4h3l7 7M20 4h-3l-7 7"/><path d="M6.5 15.5l2 2M17.5 15.5l-2 2M5 19l2.5-2.5M19 19l-2.5-2.5"/>',
  sword: '<path d="M18 3h3v3l-10 10-3-3z" class="f"/><path d="M18 3h3v3l-10 10-3-3zM6.5 14.5l3 3M4 20l3.5-3.5M5 16l3 3"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" class="f"/><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6zM12 3v18M5 11h14"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" class="f"/><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  flame: '<path d="M12 21c-3.3 0-6-2.4-6-5.6 0-3.6 3-5.4 3.5-8.9 2.2 1.3 3 3 3 4.6 1-.6 1.6-1.8 1.6-3.1 2 1.6 3.9 4 3.9 7.4 0 3.2-2.7 5.6-6 5.6z" class="f"/><path d="M12 21c-3.3 0-6-2.4-6-5.6 0-3.6 3-5.4 3.5-8.9 2.2 1.3 3 3 3 4.6 1-.6 1.6-1.8 1.6-3.1 2 1.6 3.9 4 3.9 7.4 0 3.2-2.7 5.6-6 5.6z"/><path d="M12 21c-1.4 0-2.5-1-2.5-2.4 0-1.5 1.3-2.2 1.6-3.6 1.6 1 2.9 2 2.9 3.6 0 1.4-.6 2.4-2 2.4z"/>',
  torch: '<path d="M10 11h4l-1 10h-2z" class="f"/><path d="M10 11h4l-1 10h-2zM9 11h6"/><path d="M12 9c-1.8 0-3-1.2-3-2.8C9 4.4 10.6 3.6 11 2c1.2.7 1.6 1.6 1.6 2.4.6-.3.9-.9.9-1.6C14.6 3.7 15 5 15 6.2 15 7.8 13.8 9 12 9z"/>',
  spark: '<path d="M12 3l1.8 6.2L20 12l-6.2 1.8L12 21l-1.8-7.2L4 12l6.2-2.8z" class="f"/><path d="M12 3l1.8 6.2L20 12l-6.2 1.8L12 21l-1.8-7.2L4 12l6.2-2.8z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" class="f"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" class="f"/><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1M12 5a3 3 0 0 1 3-1"/>',
  tent: '<path d="M12 4L3 20h18z" class="f"/><path d="M12 4L3 20h18zM12 4l1.5-2M12 4l-1.5-2M12 11l-3 9M12 11l3 9"/>',
  fire: '<path d="M4 20l16-3M4 17l16 3"/><path d="M12 16c-2.2 0-4-1.6-4-3.8 0-2.5 2-3.6 2.4-6 1.5.9 2 2 2 3.1.7-.4 1.1-1.2 1.1-2.1C14.8 8.3 16 10 16 12.2 16 14.4 14.2 16 12 16z" class="f"/><path d="M12 16c-2.2 0-4-1.6-4-3.8 0-2.5 2-3.6 2.4-6 1.5.9 2 2 2 3.1.7-.4 1.1-1.2 1.1-2.1C14.8 8.3 16 10 16 12.2 16 14.4 14.2 16 12 16z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6" class="f"/><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5M8 8.5a3 3 0 0 1 3-1.5"/>',
  bandage: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)" class="f"/><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="M10 10.5l.01 0M12 12l.01 0M14 13.5l.01 0M11.5 9.5l.01 0M13 11l.01 0"/>',
  bread: '<path d="M4 14a8 6 0 0 1 16 0v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" class="f"/><path d="M4 14a8 6 0 0 1 16 0v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 11l1 2M12 10v2.5M16 11l-1 2"/>',
  coin: '<ellipse cx="12" cy="8" rx="7" ry="3" class="f"/><path d="M5 8c0 1.7 3.1 3 7 3s7-1.3 7-3-3.1-3-7-3-7 1.3-7 3zM5 8v4c0 1.7 3.1 3 7 3s7-1.3 7-3V8M5 12v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/>',
  skull: '<path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.2 3 5.2V19h8v-3.8c1.7-1 3-2.6 3-5.2a7 7 0 0 0-7-7z" class="f"/><path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.2 3 5.2V19h8v-3.8c1.7-1 3-2.6 3-5.2a7 7 0 0 0-7-7zM10 19v2M14 19v2"/><circle cx="9.3" cy="10.5" r="1.6" fill="currentColor"/><circle cx="14.7" cy="10.5" r="1.6" fill="currentColor"/><path d="M12 13l-.8 1.6h1.6z"/>',
  bones: '<path d="M6 18L18 6M6 6l12 12"/><circle cx="5" cy="17" r="1.6"/><circle cx="7" cy="19" r="1.6"/><circle cx="17" cy="5" r="1.6"/><circle cx="19" cy="7" r="1.6"/><circle cx="5" cy="7" r="1.6"/><circle cx="7" cy="5" r="1.6"/><circle cx="17" cy="19" r="1.6"/><circle cx="19" cy="17" r="1.6"/>',
  quill: '<path d="M20 3C12 4 7 9 5 17l2 2c8-2 13-7 14-15z" class="f"/><path d="M20 3C12 4 7 9 5 17l2 2c8-2 13-7 14-15zM4 21l6-6M9.5 12.5h4M12 9.5h4"/>',
  d20: '<path d="M12 2.5l8.5 5v9L12 21.5l-8.5-5v-9z" class="f"/><path d="M12 2.5l8.5 5v9L12 21.5l-8.5-5v-9zM12 2.5L7 14h10zM3.5 7.5L7 14M20.5 7.5L17 14M7 14l5 7.5 5-7.5"/>',
  d6: '<rect x="4" y="4" width="16" height="16" rx="3" class="f"/><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/>',
  stairs: '<path d="M3 20h4v-4h4v-4h4V8h4V4" /><path d="M3 20h4v-4h4v-4h4V8h4V4v16H3z" class="f"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" class="f"/><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2" class="f"/><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/>',
  potion: '<path d="M10 3h4M10.5 3v5L6 15a4.5 4.5 0 0 0 4 6h4a4.5 4.5 0 0 0 4-6l-4.5-7V3" /><path d="M7.5 14h9a4.5 4.5 0 0 1-2.5 7h-4a4.5 4.5 0 0 1-2.5-7z" class="f"/>',
  pickaxe: '<path d="M4 8c4-4 12-4 16 0-3-1.5-6-1.8-8-1.8S7 6.5 4 8z" class="f"/><path d="M4 8c4-4 12-4 16 0-3-1.5-6-1.8-8-1.8S7 6.5 4 8zM12 6.2V21"/>',
  cleaver: '<path d="M4 4h11v8H7a3 3 0 0 1-3-3z" class="f"/><path d="M4 4h11v8H7a3 3 0 0 1-3-3zM15 8h2l4 12M13 6.5l.01 0"/>',
  dagger: '<path d="M12 2l2 10h-4z" class="f"/><path d="M12 2l2 10h-4zM8 12h8M12 12v4M10.5 16h3v5h-3z"/>',
  fist: '<path d="M7 10V7a1.5 1.5 0 0 1 3 0v3M10 10V6a1.5 1.5 0 0 1 3 0v4M13 10V7a1.5 1.5 0 0 1 3 0v4M16 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a3 3 0 0 1 3-3h3" class="f"/><path d="M7 10V7a1.5 1.5 0 0 1 3 0v3M10 10V6a1.5 1.5 0 0 1 3 0v4M13 10V7a1.5 1.5 0 0 1 3 0v4M16 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a3 3 0 0 1 3-3h3"/>',
  chain: '<rect x="2.5" y="9" width="9" height="6" rx="3"/><rect x="12.5" y="9" width="9" height="6" rx="3"/><path d="M9 12h6"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/><path d="M9 19c1-2 3-2.5 3-4 0 1.5 2 2 3 4z" class="f"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z" class="f"/><path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" class="f"/><rect x="6" y="6" width="12" height="12" rx="2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  run: '<circle cx="14" cy="4.5" r="2"/><path d="M8 21l3-6 3 2v4M6 12l3-4h5l2 4 3 1M11 15l2-7"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 13v-2.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4 14a1.5 1.5 0 0 1 2.4-1.8L8 14" class="f"/><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 13v-2.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4 14a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" class="f"/><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  chest: '<path d="M3 11h18v9H3z" class="f"/><path d="M3 11a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v9H3zM3 11h18M10 11v3h4v-3"/>',
  lantern: '<path d="M8 8h8l1 10H7z" class="f"/><path d="M9 3h6M12 3v2M7 5h10v3H7zM8 8h8l1 10H7zM6 18h12v3H6z"/><path d="M12 11c-1 1-1.4 2-1 3s2 1 2 0-.4-2-1-3z"/>',
  ghost: '<path d="M5 20V10a7 7 0 0 1 14 0v10l-2.3-2-2.4 2-2.3-2-2.3 2-2.4-2z" class="f"/><path d="M5 20V10a7 7 0 0 1 14 0v10l-2.3-2-2.4 2-2.3-2-2.3 2-2.4-2z"/><circle cx="9.5" cy="10" r="1.2" fill="currentColor"/><circle cx="14.5" cy="10" r="1.2" fill="currentColor"/>',
  wolf: '<path d="M4 4l4 5h8l4-5-1 9-3 5-4 3-4-3-3-5z" class="f"/><path d="M4 4l4 5h8l4-5-1 9-3 5-4 3-4-3-3-5zM9 13l1 1M15 13l-1 1M11 17h2"/>',
  wave: '<path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"/>',
  rot: '<circle cx="12" cy="12" r="8" class="f"/><circle cx="12" cy="12" r="8"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="9" r="1"/><circle cx="13.5" cy="15" r="2"/><circle cx="8.5" cy="15" r=".8"/>',
  ration: '<path d="M5 9h14l-1.5 11h-11z" class="f"/><path d="M5 9h14l-1.5 11h-11zM8 9V6a4 4 0 0 1 8 0v3"/>',
  pack: '<path d="M6 8a6 6 0 0 1 12 0v12H6z" class="f"/><path d="M6 8a6 6 0 0 1 12 0v12H6zM9 4.5V3h6v1.5M6 12h12M10 12v3h4v-3"/>',
  ring: '<circle cx="12" cy="14" r="6"/><path d="M9.5 6.5L12 3l2.5 3.5L12 8z" class="f"/><path d="M9.5 6.5L12 3l2.5 3.5L12 8z"/>',
  amulet: '<path d="M5 3c0 6 3 9 7 9s7-3 7-9"/><path d="M12 12l3.5 4.5L12 21l-3.5-4.5z" class="f"/><path d="M12 12l3.5 4.5L12 21l-3.5-4.5z"/>',
  boot: '<path d="M7 3h6v10l6 3v4H5v-4z" class="f"/><path d="M7 3h6v10l6 3v4H5v-4zM5 17h14"/>',
  glove: '<path d="M7 21v-8L5 9a1.5 1.5 0 0 1 2.6-1.4L9 9.5V4.5a1.5 1.5 0 0 1 3 0V9V3.5a1.5 1.5 0 0 1 3 0V9.5V5a1.5 1.5 0 0 1 3 0v9l-1 7z" class="f"/><path d="M7 21v-8L5 9a1.5 1.5 0 0 1 2.6-1.4L9 9.5V4.5a1.5 1.5 0 0 1 3 0V9V3.5a1.5 1.5 0 0 1 3 0V9.5V5a1.5 1.5 0 0 1 3 0v9l-1 7z"/>',
  belt: '<path d="M2 9h20v6H2z" class="f"/><path d="M2 9h20v6H2zM9 8h6v8H9zM12 11v2"/>',
  pouch: '<path d="M8 6h8l-1 2c3 1.5 5 4.5 5 7.5A4.5 4.5 0 0 1 15.5 20h-7A4.5 4.5 0 0 1 4 15.5c0-3 2-6 5-7.5z" class="f"/><path d="M8 6h8l-1 2c3 1.5 5 4.5 5 7.5A4.5 4.5 0 0 1 15.5 20h-7A4.5 4.5 0 0 1 4 15.5c0-3 2-6 5-7.5zM9 8h6"/>',
  vial: '<path d="M9 3h6M10 3v6l-4 9a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-4-9V3"/><path d="M7.5 15h9l1.3 3a2 2 0 0 1-1.8 3H8a2 2 0 0 1-1.8-3z" class="f"/>',
  gem: '<path d="M6 4h12l3 5-9 11L3 9z" class="f"/><path d="M6 4h12l3 5-9 11L3 9zM3 9h18M9 4l3 16M15 4l-3 16"/>',
  mapscroll: '<path d="M4 5h12a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z" class="f"/><path d="M4 5h12a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3zM8 9l2 2 3-3 3 4M8 14h8"/>',
  scales: '<path d="M12 3v18M6 21h12M4 7h16M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/><path d="M4 14h6a3 3 0 0 1-6 0zM14 14h6a3 3 0 0 1-6 0z" class="f"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
};
// items: a word in the name picks the drawing
const ITEM_ICONS = [[/pick/i, 'pickaxe'], [/cleaver|axe/i, 'cleaver'], [/dagger|knife|shard/i, 'dagger'], [/sword|blade/i, 'sword'], [/breast|armou?r|plate|mail|rags/i, 'shield'],
  [/torch/i, 'torch'], [/lamp|lantern|candle/i, 'lantern'], [/flint|tinder/i, 'flame'], [/ration|tack|bread|food/i, 'ration'], [/lichen|ingredient|herb|mushroom/i, 'bread'],
  [/water|skin|flask/i, 'drop'], [/vial|salve|potion|elixir|oil/i, 'vial'], [/needle|bandage|suture/i, 'bandage'], [/map/i, 'mapscroll'], [/sigil|amulet|talisman/i, 'amulet'],
  [/stone|crystal|gem/i, 'gem'], [/ring/i, 'ring'], [/urn|jar|box|chest/i, 'chest'], [/coin|gold|silver/i, 'coin'], [/scrap|iron|supplies/i, 'chain'], [/bone|skull/i, 'bones']];
export const itemIcon = (name) => (ITEM_ICONS.find(([re]) => re.test(name)) || [null, 'pouch'])[1];

export default function Ico({ n, size = 20, className = '', title }) {
  const inner = P[n] || P.dot;
  return (
    <svg className={`dbi ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} dangerouslySetInnerHTML={{ __html: `${title ? `<title>${title}</title>` : ''}${inner}` }} />
  );
}
