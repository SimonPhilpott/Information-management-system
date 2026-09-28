# Implementation Plan: AndroidAPS Inter-App Intent Integration for Food Logging

**Date:** 2026-09-28  
**Architecture Target:** Information Management System (IMS) – Food Logging Subsystem  
**Components:** [`src/components/Dashboard/PhotoCarbs.jsx`](file:///D:/Information%20management%20system/src/components/Dashboard/PhotoCarbs.jsx), [`pdf-knowledge-base/server/services/glucoseHubService.js`](file:///D:/Information%20management%20system/pdf-knowledge-base/server/services/glucoseHubService.js), [`pdf-knowledge-base/server/routes/glucoseHub.js`](file:///D:/Information%20management%20system/pdf-knowledge-base/server/routes/glucoseHub.js)

---

## 1. Problem Statement & Scope

Currently, the food analysis component ([`PhotoCarbs.jsx`](file:///D:/Information%20management%20system/src/components/Dashboard/PhotoCarbs.jsx)) calculates both estimated carbohydrates and a recommended insulin dose (based on an assumed carb ratio), displaying an insulin stepper and logging an active `Meal Bolus` treatment containing both carbs and insulin directly to Nightscout.

### Deficiencies in Current Flow:
1. **Loop Safety & Duplication Risk:** In an artificial pancreas setup running AndroidAPS (AAPS), AAPS calculates accurate insulin dosing based on active insulin (IOB), active carbs (COB), current glucose trends, and profile rules. When insulin is delivered through AAPS, AAPS itself pushes the finalized treatment (`Meal Bolus` with carbs + insulin) to Nightscout. If IMS directly sends carb and insulin treatments to Nightscout, double-bolusing or duplicate carb counting occurs, corrupting looping algorithms.
2. **Platform Flow Disconnect:** The user must manually transcribe carb values into AAPS or risk unverified deliveries.
3. **Regulatory / Assisted Delivery Compliance:** AAPS forbids external third-party apps from silently triggering insulin delivery. Inter-App Android Intents (`info.nightscout.androidaps.action.OPEN_BOLUS_WIZARD`) pre-populate the Bolus Wizard with carb and note data, requiring the user to physically review and tap confirm on the device.

### Desired Behavior:
1. **Remove Insulin Dosing Controls:** Eliminate the insulin dose estimation, insulin stepper controls, and insulin delivery payload from the UI and backend logging service.
2. **Trigger AAPS Bolus Wizard Intent:** On Android devices, clicking **"Send to AAPS Bolus Wizard"** invokes an Android Intent URI (`intent:#Intent;action=info.nightscout.androidaps.action.OPEN_BOLUS_WIZARD;package=info.nightscout.androidaps;d.carbs=...;S.notes=...;S.source=IMS;end`) to launch AAPS with carbs and food item notes pre-filled.
3. **Cease Active Carb/Bolus Treatments in Nightscout:** Do not post `eventType: 'Meal Bolus'` or active `carbs` to Nightscout treatments from IMS.
4. **Push Informational Nightscout Notes:** Send an informational `eventType: 'Note'` treatment to Nightscout containing the meal summary, item breakdown, and estimated carbs. This renders cleanly on the Nightscout timeline for audit and history without registering active carbohydrates or pending insulin in the closed loop.
5. **Local Persistence:** Retain meal data and carb estimations in IMS local SQLite (`carb_log` table) for internal history and AI context.

---

## 2. Technical Architecture & Protocols

### A. Android Intent Specification (AAPS)
AAPS registers an `intent-filter` on `info.nightscout.androidaps.action.OPEN_BOLUS_WIZARD`:
- **Action:** `info.nightscout.androidaps.action.OPEN_BOLUS_WIZARD`
- **Target Package:** `info.nightscout.androidaps`
- **Extras:**
  - `carbs` (Double/Float): Numerical carb quantity (e.g., `45.0` or `45`).
  - `notes` (String): Food description summary (e.g., `Pasta Bolognaise - 45g`).
  - `source` (String): Calling app identifier (`IMS`).
- **Android Intent Scheme URI (Web/PWA):**
  ```text
  intent:#Intent;action=info.nightscout.androidaps.action.OPEN_BOLUS_WIZARD;package=info.nightscout.androidaps;d.carbs=${carbs};S.notes=${encodeURIComponent(notes)};S.source=IMS;end
  ```
- **Fallback Behavior (Desktop / Non-Android Browsers):**
  When accessed from desktop or unsupported browsers, detect platform via `navigator.userAgent`. Provide visual notification with a **Copy Carbs to Clipboard** fallback action, informing the user that AAPS Intent delivery is available natively on Android devices.

### B. Nightscout API Treatment Payload
Nightscout `/api/v1/treatments` endpoint changes:
```json
{
  "enteredBy": "IMS PhotoCarbs",
  "eventType": "Note",
  "notes": "🍽️ Meal Log (Est. 45g carbs): Pasta Bolognaise, Garlic bread. Sent to AAPS Bolus Wizard.",
  "created_at": "2026-09-28T11:15:00.000Z"
}
```
*Note:* No `carbs` or `insulin` numeric attributes are attached to the treatment payload to ensure the Nightscout careportal and OpenAPS/AAPS loop engines treat it strictly as an informational audit marker.

---

## 3. Step-by-Step Implementation Tasks

### Task 1: Backend Service Refactoring (`glucoseHubService.js` & Routes)
- **File:** [`pdf-knowledge-base/server/services/glucoseHubService.js`](file:///D:/Information%20management%20system/pdf-knowledge-base/server/services/glucoseHubService.js)
  1. Deprecate and replace `postCarbsToNightscout(carbs, insulin, foodNotes)` with `postFoodNoteToNightscout(carbs, foodNotes)`.
  2. Modify payload sent to `POST ${nsUrl}/api/v1/treatments`:
     - Change `eventType` to `'Note'`.
     - Remove `carbs: Number(carbs)` and `insulin: Number(insulin)` fields from the Nightscout treatment payload.
     - Format `notes` string with clear prefix: `🍽️ Meal Log (Est. ${carbs}g): ${foodNotes}`.
  3. Update `logCarbs({ carbs, insulin, food_name, notes, image_path })`:
     - Maintain local SQLite insertion into `carb_log` table (storing `carbs`, `food_name`, `notes`, `image_path` for historical reporting). Set `insulin: null`.
     - Call `postFoodNoteToNightscout(carbs, foodSummary)`.
     - Return `{ success: true, nightscoutNote: true, carbs, food_name }`.
- **File:** [`pdf-knowledge-base/server/routes/glucoseHub.js`](file:///D:/Information%20management%20system/pdf-knowledge-base/server/routes/glucoseHub.js)
  - Verify request validation handles payload without requiring `insulin`.

### Task 2: Frontend Refactoring (`PhotoCarbs.jsx`)
- **File:** [`src/components/Dashboard/PhotoCarbs.jsx`](file:///D:/Information%20management%20system/src/components/Dashboard/PhotoCarbs.jsx)
  1. **Remove Insulin Estimation State & Controls:**
     - Remove `insulinRatio` and `insulinDose` state variables.
     - Remove the "Suggested Bolus", unit stepper (`-` / `+`), and insulin dose input controls from the meal analysis result card.
     - Remove the `suggested_insulin` parsing from Claude/OpenAI analysis parsing logic.
  2. **Implement AAPS Intent Invocation:**
     - Build helper function `launchAAPSIntent(carbs, notes)`:
       ```javascript
       const isAndroid = /android/i.test(navigator.userAgent);
       const noteText = notes || "Meal from IMS";
       const intentUrl = `intent:#Intent;action=info.nightscout.androidaps.action.OPEN_BOLUS_WIZARD;package=info.nightscout.androidaps;d.carbs=${carbs};S.notes=${encodeURIComponent(noteText)};S.source=IMS;end`;
       ```
     - If on Android, trigger intent via `window.location.href = intentUrl;`.
     - If non-Android or intent cannot launch, display a banner/toast with carb count and copy-to-clipboard functionality.
  3. **Update Submit Action & UI Labels:**
     - Replace button **"Log Meal & Bolus"** with **"Send to AAPS & Log Note"** (primary) and an optional secondary **"Log Note Only (No AAPS)"**.
     - In `handleConfirm()`:
       1. Call backend `/api/glucose/carbs` to log meal note to Nightscout and save locally in SQLite.
       2. Trigger `launchAAPSIntent(carbs, foodNotes)`.
       3. Display clear feedback banner informing user: *"AAPS Bolus Wizard opened. Please review and confirm delivery in AAPS."*

### Task 3: Build Verification & Static Analysis
- Run `npm run build` or Vite build check to verify JSX and TypeScript/ES syntax.
- Verify dependency graph and caller graph via `codegraph-spfx` or `codegraph-ims`.

### Task 4: Triple Registry Synchronization & Task List Protocol
- Update [`feature.json`](file:///D:/Information%20management%20system/feature.json) with feature entry `FEAT-081: AAPS Inter-App Intent Food Logging`.
- Update [`ProjectStructure.JSON`](file:///D:/Information%20management%20system/ProjectStructure.JSON) to reflect updated endpoints/components if modified.
- Update [`test_plan.md`](file:///D:/Information%20management%20system/test_plan.md):
  - Section 1 Matrix Row (`FEAT-081`, link to `PhotoCarbs.jsx`, verification method, target status `PASS`).
  - Section 2 Functional Test Suite for AAPS intent invocation, Nightscout Note creation, and non-Android fallback.
  - Section 3 Defensive Invariants (URL encoding of intent extras, user confirmation gate in AAPS).
  - Executive summary metrics update.
- Update [`./TASK_LIST.md`](file:///D:/Information%20management%20system/TASK_LIST.md) with `DD/MM/YYYY HH:mm` timestamps.

---

## 4. Verification & Testing Steps

1. **Static Analysis & Build:**
   - Execute `npm run build` to confirm zero JSX compilation errors.
2. **Intent Scheme URL Validation:**
   - Test generated Intent string matches AAPS specification:
     `intent:#Intent;action=info.nightscout.androidaps.action.OPEN_BOLUS_WIZARD;package=info.nightscout.androidaps;d.carbs=45;S.notes=Fish%20and%20chips;S.source=IMS;end`
3. **Nightscout Treatment Verification:**
   - Inspect mock/live Nightscout `treatments` response:
     - Verify `eventType === 'Note'`.
     - Verify no numeric `carbs` or `insulin` properties exist on the treatment record.
4. **Desktop / Non-Android Fallback Check:**
   - On desktop Chrome/Edge, clicking the button logs the note to Nightscout and informs the user to enter carbs manually into AAPS, copying the carb number to the clipboard.
