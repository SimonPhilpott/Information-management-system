"""Garmin Connect daily pull for IMS (see docs/plans/2026-10-06-garmin-integration-plan.md).

Prints one JSON object on stdout; Node (services/garminService.js) does all database writes.

  python garmin_sync.py login            # first time: needs GARMIN_EMAIL / GARMIN_PASSWORD env vars
  python garmin_sync.py day 2026-10-06   # one day's metrics, using the saved tokens

Tokens are kept in GARMIN_TOKEN_DIR (pdf-knowledge-base/data/garmin by default) so the password is
only needed once. Every metric is fetched on its own - one endpoint changing never loses the rest.
Needs: pip install garminconnect
"""
import json
import os
import sys

TOKEN_DIR = os.environ.get("GARMIN_TOKEN_DIR") or os.path.join(os.path.dirname(__file__), "..", "..", "data", "garmin")


def out(obj, code=0):
    print(json.dumps(obj, default=str))
    sys.exit(code)


def client():
    try:
        from garminconnect import Garmin
    except ImportError:
        out({"ok": False, "error": "garminconnect is not installed - run: pip install garminconnect"}, 2)
    g = Garmin()
    g.login(TOKEN_DIR)  # raises if there are no saved tokens yet
    return g


def login():
    email, password = os.environ.get("GARMIN_EMAIL"), os.environ.get("GARMIN_PASSWORD")
    mfa = os.environ.get("GARMIN_MFA_CODE")
    if not email or not password:
        out({"ok": False, "error": "GARMIN_EMAIL and GARMIN_PASSWORD are needed for the first login"}, 2)
    from garminconnect import Garmin
    os.makedirs(TOKEN_DIR, exist_ok=True)
    prompt_cb = (lambda: mfa) if mfa else None
    g = Garmin(email, password, prompt_mfa=prompt_cb)
    g.login(TOKEN_DIR)
    out({"ok": True, "tokenDir": os.path.abspath(TOKEN_DIR)})


def first(*vals):
    for v in vals:
        if v is not None:
            return v
    return None


def day(date):
    g = client()
    raw, errors = {}, {}
    calls = {
        "summary": lambda: g.get_user_summary(date),
        "sleep": lambda: g.get_sleep_data(date),
        "hrv": lambda: g.get_hrv_data(date),
        "readiness": lambda: g.get_training_readiness(date),
        "status": lambda: g.get_training_status(date),
        "maxMetrics": lambda: g.get_max_metrics(date),
        "racePredictions": lambda: g.get_race_predictions(),
        "bodyBattery": lambda: g.get_body_battery(date, date),
        "hrZones": lambda: g.get_heart_rate_zones(),
    }
    for name, fn in calls.items():
        try:
            raw[name] = fn()
        except Exception as e:  # noqa: BLE001 - keep going, report what failed
            errors[name] = str(e)[:200]

    s = raw.get("summary") or {}
    sl = ((raw.get("sleep") or {}).get("dailySleepDTO")) or {}
    hrv = ((raw.get("hrv") or {}).get("hrvSummary")) or {}
    rd = raw.get("readiness")
    rd = (rd[0] if isinstance(rd, list) and rd else rd) or {}
    mm = raw.get("maxMetrics")
    mm = (mm[0] if isinstance(mm, list) and mm else mm) or {}
    generic = (mm.get("generic") or {}) if isinstance(mm, dict) else {}
    st = raw.get("status") or {}
    rp = raw.get("racePredictions") or {}
    rp = rp[0] if isinstance(rp, list) and rp else rp
    bb = raw.get("bodyBattery")
    bb = (bb[0] if isinstance(bb, list) and bb else bb) or {}

    m = {
        "date": date,
        "vo2max": first(generic.get("vo2MaxPreciseValue"), generic.get("vo2MaxValue")),
        "fitnessAge": generic.get("fitnessAge"),
        "race5kS": rp.get("time5K") if isinstance(rp, dict) else None,
        "race10kS": rp.get("time10K") if isinstance(rp, dict) else None,
        "raceHalfS": rp.get("timeHalfMarathon") if isinstance(rp, dict) else None,
        "raceMarathonS": rp.get("timeMarathon") if isinstance(rp, dict) else None,
        "sleepScore": ((sl.get("sleepScores") or {}).get("overall") or {}).get("value"),
        "sleepS": sl.get("sleepTimeSeconds"),
        "deepS": sl.get("deepSleepSeconds"),
        "remS": sl.get("remSleepSeconds"),
        "lightS": sl.get("lightSleepSeconds"),
        "awakeS": sl.get("awakeSleepSeconds"),
        "sleepStart": sl.get("sleepStartTimestampGMT"),
        "sleepEnd": sl.get("sleepEndTimestampGMT"),
        "hrvNight": hrv.get("lastNightAvg"),
        "hrvWeekly": hrv.get("weeklyAvg"),
        "hrvStatus": hrv.get("status"),
        "restingHr": s.get("restingHeartRate"),
        "restingHr7d": s.get("lastSevenDaysAvgRestingHeartRate"),
        "bodyBatteryWake": first(s.get("bodyBatteryAtWakeTime"), bb.get("charged")),
        "bodyBatteryMax": s.get("bodyBatteryHighestValue"),
        "bodyBatteryMin": s.get("bodyBatteryLowestValue"),
        "stressAvg": s.get("averageStressLevel"),
        "readinessScore": rd.get("score"),
        "readinessLevel": rd.get("level"),
        "recoveryTimeMin": rd.get("recoveryTime"),
        "trainingStatus": str(st.get("mostRecentTrainingStatus", {}).get("latestTrainingStatusData", ""))[:400] if isinstance(st, dict) else None,
        "hrZones": raw.get("hrZones") or [],
    }
    out({"ok": True, "metrics": m, "errors": errors})


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if cmd == "login":
            login()
        elif cmd == "day" and len(sys.argv) > 2:
            day(sys.argv[2])
        else:
            out({"ok": False, "error": "usage: garmin_sync.py login | day YYYY-MM-DD"}, 2)
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        out({"ok": False, "error": str(e)[:300]}, 1)
