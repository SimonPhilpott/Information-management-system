// Builds a PortraitFace frame set from an expression folder: neutral is the base painting's own mouth shapes,
// every other emotion is <expr>-closed / -mid / -wide plus its morph in-betweens <expr>-m1..m4.
export function buildFrames(neutral, files) {
  const frames = { neutral };
  for (const [path, url] of Object.entries(files)) {
    const m = path.match(/\/([a-z]+)-(closed|mid|wide|m[1-4])\.webp$/);
    if (!m) continue;
    (frames[m[1]] ||= {})[m[2]] = url;
  }
  return frames;
}
