// The time axis shared by the run charts (Run plan, Plan against reality, Flythrough): the run itself gets most of
// the width and the 2 hours after it are compressed into the last part, so a 50-minute run isn't squeezed into the
// left third. Piecewise linear: minutes 0..dur across runShare of the plot, dur..total across the rest.
export function makeTimeScale({ L, W, R, dur, total, from = 0, runShare = 0.72 }) {
  const plotW = W - L - R;
  const runW = plotW * runShare;
  const run = Math.max(1, dur - from);
  const after = Math.max(1, total - dur);
  const X = (m) => (m <= dur ? L + ((m - from) / run) * runW : L + runW + ((Math.min(m, total) - dur) / after) * (plotW - runW));
  const inv = (x) => {
    const p = x - L;
    const m = p <= runW ? from + (p / runW) * run : dur + ((p - runW) / (plotW - runW)) * after;
    return Math.max(from, Math.min(total, m));
  };
  // ticks: every 10, 15 or 30 minutes through the run, then +30 / +60 / +90 / +120 after the finish
  const step = run <= 40 ? 10 : run <= 100 ? 15 : 30;
  const ticks = [];
  for (let m = Math.max(0, Math.ceil(from / step) * step); m <= dur - step * 0.4; m += step) ticks.push({ m, label: m === 0 ? 'start' : `${m} min`, anchor: m === 0 ? 'start' : 'middle' });
  ticks.push({ m: dur, label: `finish ${Math.round(dur)} min`, anchor: 'middle', strong: true });
  for (let a = 30; dur + a <= total + 0.5; a += 30) ticks.push({ m: dur + a, label: `+${a}`, anchor: dur + a >= total - 1 ? 'end' : 'middle' });
  return { X, inv, ticks, runW };
}
