# Garmin Connect integration - plan

Written 6 Oct 2026. Not started.

## Goal

Bring Garmin's daily health and fitness data into IMS. Strava already supplies activities, but it never receives VO2 max, sleep, HRV, Body Battery, resting heart rate, heart-rate zones or training readiness. The Run Planner, day report and Ims would use them.

## Approach

- **Library:** use `garminconnect`, the open-source Python library. It works through Garmin's private endpoints, so treat it as optional: if it fails, everything carries on with Strava data alone.
- **Script:** a small Python script, `pdf-knowledge-base/server/garmin/garmin_sync.py`, pulls the data and writes it into the IMS SQLite database.
  - Node runs it from the scheduler each morning at about 06:30 London time, and again on demand.
  - Reuse the existing scheduler and the dev-ideas failure flag.
- **Login:**
  - Simon enters his Garmin email and password once on a settings page. The script logs in, saves the token file under `data/garmin/`, and stores the password encrypted with `encryptSecret`, the same way as the Nightscout secret.
  - Two-factor sign-in, if switched on, needs a one-off code prompt on the same page.
- **Failure handling:** on a login or endpoint failure, log it, flag a dev idea, show "Garmin: last synced …" on the page, and never block the day report or the Run Planner.

## Phase 1 - morning pull (build first)

**Data:** new table `garmin_daily` (one row per day):
- VO2 max (running), race predictions (5 km, 10 km, half marathon, marathon) and fitness age;
- sleep (score, duration, deep/REM/light/awake minutes, start and end times);
- overnight HRV and its baseline status;
- resting heart rate and its 7-day average;
- Body Battery (on waking, maximum, minimum);
- stress (average);
- training readiness (score and level), training status, acute load and recovery time;
- heart-rate zone boundaries.

**Where it shows up:**

1. **Day report:** a new "Sleep & recovery" section, before training. It covers sleep score and duration, resting heart rate against its baseline, Body Battery on waking and training readiness. Add it to the section settings with the usual "how much to say" options. It must link to the glucose section where it fits (a poor night and a high waking reading).
2. **Readiness before a planned run:** if a run is in the calendar today, the report and Ims say whether it's a good day for it, from readiness, Body Battery and sleep: "good day for the hard one" or "swap it for an easy run".
3. **Run Planner fuelling:**
   - Pass the heart-rate zones into the demand model, so intensity comes from zones, not a guess from pace.
   - On a poor-sleep or low-HRV day, add a note to start higher in the target range or move the first carb stop earlier. Every plan still has at least one carb stop, as always.
4. **Ims:** a `getRecovery` tool (or extend `getBloodGlucose`'s timeline) so Ims can answer "how did I sleep?" and "am I recovered enough to run?". Health talk stays in reports and in answers to direct questions only.

## Phase 2 - after a week or two of reliable syncing

5. **Run plan demand and pace:** use VO2 max and the race predictions as the fitness input for expected time and effort, and keep the Strava-pace estimate as a fallback.
6. **Training load chart:** show Garmin's acute load and training status alongside fitness, fatigue and form, and use Garmin's recovery time for the "if you rest" projection.
7. **Run retrospectives:** heart rate against Simon's zones for each run, with time in zone 4–5 lined up with glucose dips. Per-run heart rate already comes from Strava streams; the zones come from Garmin.
8. **Glucose analysis:** over 30+ days, match overnight glucose against sleep stages and stress (dawn rises after poor sleep, high-stress days). Feed this into the existing insight prompts as context.
9. **Goals:** VO2 max and fitness-age trend in the goal progress view.

## Tasks for phase 1

1. `pip install garminconnect`, using the same Python as before (`C:\Python312`), and note it in the README.
2. `garmin_sync.py --date YYYY-MM-DD` (default today and yesterday). It prints JSON, and Node writes the rows, so all database access stays in Node.
3. `services/garminService.js`:
   - run the script;
   - upsert `garmin_daily`;
   - `getGarminDay(date)` and `garminForPrompt()`;
   - status and last error.
4. Scheduler job `garmin_sync` (06:30, retry at 08:00), plus a manual "Sync now" button.
5. Settings card (Activities page): connect / disconnect, the two-factor code box, last synced and last error.
6. Day report section and the readiness line (`morningReportService.js`).
7. Run Planner fuelling: heart-rate zones and the poor-sleep note.
8. Ims tool and prompt line, and a test bench scenario ("am I ready to run today?").
9. Log TASK entries, add a `feature.json` entry and a test plan suite.

## Risks

- **Garmin changes its login:** syncing stops until the library is updated. IMS shows the failure and carries on.
- **Garmin's terms:** this is personal use of his own data at once a day. No scraping of other accounts.
- **Credentials:** the password is encrypted at rest, the token file sits in `data/` (already gitignored), and nothing is logged.
