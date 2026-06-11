# 🛡️ Manifest Governance Protocol: Gemini Edition

This protocol is a MANDATORY checklist for every turn. It ensures that the AI coding assistant (Gemini) remains synchronized with the project's architectural and visual "Source of Truth."

## 1. The Trinity of Truth
Before EVERY implementation step, Gemini MUST verify:
- **`ComponentStyleRules.JSON`**: Is the styling using defined tokens? Is there a new spec needed?
- **`feature.JSON`**: Is this change mapped to an existing feature? Should a new feature be logged?
- **`ProjectStructure.JSON`**: Is the file being placed or modified in the correct architectural module?

## 2. Zero-Drift Mandate
- **No Magic Numbers**: Pixel values and hex codes are strictly forbidden in CSS/JSX unless they are defined in the manifest.
- **Unified Interactions**: All components of a similar class (e.g., all Buttons, all Toggles) MUST share identical hover and transition protocols.
- **Explicit Invalidation**: If a manifest rule must be broken for a specific technical reason, it MUST be documented in the task log and the manifest MUST be updated first.

## 3. Research Library Integration
PDF books from **`G:\My Drive\BOOKS`** MUST be used as supporting research material when formulating responses. This applies to architectural decisions, implementation patterns, and domain knowledge.

- **Scope**: All PDFs under `G:\My Drive\BOOKS` recursively.
- **Exclusion**: The **`RPG`** subfolder is explicitly excluded — do not use books from `G:\My Drive\BOOKS\RPG\` or any subfolder thereof.
- **Priority**: When research-backed guidance conflicts with an uninformed default, the research source takes precedence. Cite the relevant source where applicable.

## 4. Mission Checkpoint Requirements
Every response MUST end with a **Manifest Audit Trail**:
- ✅ **Design**: Verified styling against `ComponentStyleRules.JSON`.
- ✅ **Feature**: Verified mapping against `feature.JSON`.
- ✅ **Structure**: Verified integrity against `ProjectStructure.JSON`.
- ✅ **Research**: Consulted PDF library at `G:\My Drive\BOOKS` (excluding RPG).
- ✅ **Console**: Verified zero runtime errors using `browser_subagent`.

---
*Status: ACTIVE*
*Version: 1.1.0*
