// Run planner: the classic planner's panels (the plan editor, replays, lessons, the rulebook) shown inside the
// new design while it's being compared. They get the beta's card, button and field styles through the class names they
// already take, and rpb.css tones the rest of them green on oatmeal.
import React from 'react';

export const LEGACY_CLASSES = {
  panel: 'rpb-panel',
  btn: 'rpb-btn',
  ghost: 'rpb-ghost',
  field: 'rpb-field',
  label: 'rpb-label',
};

export function Legacy({ title, lead, children }) {
  return (
    <div className="gutter rpb-legacy-wrap">
      {title && <h2 className="rpb-h2">{title}</h2>}
      {lead && <p className="muted rpb-lead">{lead}</p>}
      <div className="rpb-legacy">{children(LEGACY_CLASSES)}</div>
    </div>
  );
}
