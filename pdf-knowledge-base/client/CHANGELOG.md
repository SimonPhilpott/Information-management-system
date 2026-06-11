# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-05-06
### Added
- **Design System Synchronization**: Established `ComponentStyleRules.JSON` as the single source of truth for all UI components.
- **Admin Portal Parity**: Refactored `VisualPreview` in `AdminPortal.jsx` to consume dynamic design tokens.
- **Documentation Suite**: Added `README.md`, `ARCHITECTURE.md`, `llms.txt`, and `ADR-001`.
- **Gap Analysis Report**: Documented discrepancies between production CSS and JSON specifications.

### Changed
- Updated `feature.JSON` to include Design System Synchronization (FEAT-025).
- Decoupled hardcoded styles from Admin Portal previews.

### Fixed
- Detached icons and incorrect border-radii in administrative persona toggles.
- Sidebar resizing constraints and flex-box layout conflicts.

## [1.1.0] - 2026-05-05
### Added
- **Dynamic Port Configuration**: Added Admin Portal control to change localhost and ngrok ports.
- **Voice Interruption Protocol**: Automatic AI speech cancellation upon user voice input.
- **Zero Truncation Summary Protocol**: Expanded viewport-aware tooltips for full text visibility.

## [1.0.0] - 2026-04-22
### Added
- Initial release of the PDF Knowledge Base.
- Core research assistant features with Gemini 1.5 Pro.
- Multimodal workspace with Imagen 4.0 integration.
- Google OAuth authentication gating.
