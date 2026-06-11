# ADR-001: Design System Synchronization & Visual Parity

## Status
Accepted

## Context
The Admin Portal features a `VisualPreview` section designed to simulate production components. Previously, these previews relied on hardcoded CSS or duplicated styles, leading to "Visual Drift" where administrative previews looked different from the actual live application. This undermined the utility of the Admin Portal as a diagnostic and development tool.

## Decision
We decided to implement a **Token-Driven Synchronization Protocol**. 

1.  **Registry**: `src/ComponentStyleRules.JSON` was established as the Absolute Single Source of Truth (SSoT) for all component geometry, spacing, and interaction tokens.
2.  **Consumption**: The `VisualPreview` component in `AdminPortal.jsx` was refactored to consume these JSON tokens dynamically.
3.  **Governance**: Any changes to production styles in `index.css` must be reflected in `ComponentStyleRules.JSON` to maintain parity.

## Consequences

### Positive
- **Zero Drift**: Admin previews now exactly match production rendering.
- **Rapid Prototyping**: New components can be defined in JSON and immediately previewed in the Admin Portal.
- **Traceability**: All design decisions are documented and version-controlled in the JSON registry.

### Negative
- **Maintenance Overhead**: Requires updating two places (CSS and JSON) until a more automated build-time generation tool is implemented.
- **Logic Complexity**: The `VisualPreview` component requires mapping logic to translate JSON tokens to inline styles.

## References
- [ComponentStyleRules.JSON](../../src/ComponentStyleRules.JSON)
- [AdminPortal.jsx](../../src/components/Admin/AdminPortal.jsx)
