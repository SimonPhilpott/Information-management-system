"""Headless scan engine for the /ims/musicscan IMS integration.

Walks the MUZAK network share (Genre/Artist/Album) and, for every artist,
records ALL their MusicBrainz albums/EPs with an owned / not-owned flag and
the release's exact date (with its precision - MusicBrainz often only knows
a year or a month), plus any local album folders MusicBrainz has no match
for. The web UI does all the windowing (day/week/month/...) on this data.

Modes:
  python ims_scan_service.py                 full scan (nightly / "Scan Now")
  python ims_scan_service.py --artist NAME   re-scan a single artist after
                                             their name/aliases were edited

Files under this folder:
  ims_scan_config.json    adjustable variables
  ims_scan_artists.json   per-artist overrides: {name: {searchName, aliases}}
  ims_scan_status.json    live progress, polled by the web UI
  ims_scan_results.json   {lastScanCompleted, artists: {name: entry}}
"""
import os
import re
import sys
import json
import datetime
import musicbrainzngs

PROJECT_DIR = r"D:\Music scanner"
CONFIG_PATH = os.path.join(PROJECT_DIR, "ims_scan_config.json")
ARTISTS_PATH = os.path.join(PROJECT_DIR, "ims_scan_artists.json")
STATUS_PATH = os.path.join(PROJECT_DIR, "ims_scan_status.json")
RESULTS_PATH = os.path.join(PROJECT_DIR, "ims_scan_results.json")

DEFAULT_CONFIG = {
    "muzak_path": r"\\Sideburnt\NorthField\MUZAK",
    "excluded_artists": [
        "various artists", "various", "unknown", "unknown artist",
        "soundtrack", "va", "compilations"
    ],
    "release_types": ["Album", "EP"],
    "chunk_size": 25,
    "rate_limit_per_sec": 1.0,
    "schedule_time": "01:00",
    "schedule_enabled": True
}

musicbrainzngs.set_useragent("IMSMusicScanService", "1.0.0", "https://github.com/yourusername/ims")


def read_json(path, fallback):
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return fallback


def write_json_atomic(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    os.replace(tmp, path)


def load_config():
    cfg = {**DEFAULT_CONFIG, **read_json(CONFIG_PATH, {})}
    if not os.path.exists(CONFIG_PATH):
        write_json_atomic(CONFIG_PATH, cfg)
    return cfg


def write_status(**fields):
    status = read_json(STATUS_PATH, {})
    status.update(fields)
    write_json_atomic(STATUS_PATH, status)


def now_iso():
    return datetime.datetime.now().astimezone().isoformat()


def slug(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def title_matches_folder(title, folder):
    """Does this local album folder correspond to this MusicBrainz title?
    Punctuation-insensitive containment; very short titles ('X', 'IV') must
    match as a whole word so they don't match every folder containing the letter."""
    ts = slug(title)
    if not ts:
        return False
    if len(ts) < 4:
        pattern = r"(?<![a-z0-9])" + re.escape(title.lower().strip()) + r"(?![a-z0-9])"
        return re.search(pattern, folder.lower()) is not None
    return ts in slug(folder)


def parse_date(date_str):
    """MusicBrainz first-release-date is YYYY, YYYY-MM or YYYY-MM-DD."""
    if not date_str:
        return None, None
    parts = date_str.split("-")
    if len(parts) == 1 and len(parts[0]) == 4:
        return date_str, "year"
    if len(parts) == 2:
        return date_str, "month"
    if len(parts) == 3:
        return date_str, "day"
    return None, None


def walk_muzak_library(muzak_path, excluded):
    """{artist folder name: {genre, albums: [original folder names]}}"""
    library = {}
    if not os.path.isdir(muzak_path):
        raise RuntimeError(f"MUZAK path is not reachable: {muzak_path}")
    for genre in os.listdir(muzak_path):
        genre_path = os.path.join(muzak_path, genre)
        if not os.path.isdir(genre_path):
            continue
        for artist in os.listdir(genre_path):
            artist_path = os.path.join(genre_path, artist)
            if not os.path.isdir(artist_path):
                continue
            name = artist.strip()
            if name.lower() in excluded:
                continue
            albums = [a.strip() for a in os.listdir(artist_path) if os.path.isdir(os.path.join(artist_path, a))]
            entry = library.setdefault(name, {"genre": genre.strip(), "albums": []})
            entry["albums"].extend(a for a in albums if a not in entry["albums"])
    return library


def pick_artist(results, wanted_names):
    """Prefer an exact (case-insensitive) name/sort-name/alias match among the
    top hits over blindly trusting hit #1, which is how generic names get
    hijacked by a more famous artist."""
    wanted = {w.lower().strip() for w in wanted_names}
    for a in results:
        names = {a.get("name", "").lower(), a.get("sort-name", "").lower()}
        for al in a.get("alias-list", []) or []:
            names.add((al.get("alias") or "").lower())
        if names & wanted:
            return a
    return None


def scan_artist(folder_name, info, cfg, overrides):
    """Build one artist's full entry. Never raises - a failed lookup just
    yields an entry with no releases so one bad artist can't sink the scan."""
    ov = overrides.get(folder_name, {})
    search_name = (ov.get("searchName") or folder_name).strip()
    aliases = [a.strip() for a in ov.get("aliases", []) if a.strip()]
    candidates = [search_name] + [a for a in aliases if a.lower() != search_name.lower()]

    entry = {
        "genre": info["genre"],
        "mbName": None,
        "mbId": None,
        "releases": [],
        "unlisted": list(info["albums"]),
        "error": None,
    }
    try:
        chosen = None
        first_top = None
        for name in candidates:
            hits = musicbrainzngs.search_artists(artist=name, limit=5).get("artist-list", [])
            if hits and first_top is None:
                first_top = hits[0]
            chosen = pick_artist(hits, candidates)
            if chosen:
                break
        chosen = chosen or first_top
        if not chosen:
            return entry
        entry["mbName"] = chosen.get("name")
        entry["mbId"] = chosen["id"]

        types = [t.lower() for t in cfg["release_types"]]
        groups, offset = [], 0
        while True:
            res = musicbrainzngs.browse_release_groups(artist=chosen["id"], release_type=types, limit=100, offset=offset)
            chunk = res.get("release-group-list", [])
            groups.extend(chunk)
            if len(chunk) < 100:
                break
            offset += 100

        seen = set()
        matched_folders = set()
        for rg in groups:
            if any(t in rg.get("secondary-type-list", []) for t in ("Live", "Compilation", "Remix")):
                continue
            rg_type = rg.get("type")
            if rg_type not in cfg["release_types"]:
                continue
            title = rg.get("title")
            if not title:
                continue
            date, precision = parse_date(rg.get("first-release-date", ""))
            key = (title.lower(), date)
            if key in seen:
                continue
            seen.add(key)
            folders = [f for f in info["albums"] if title_matches_folder(title, f)]
            matched_folders.update(folders)
            entry["releases"].append({
                "title": title, "type": rg_type,
                "date": date, "precision": precision,
                "owned": bool(folders),
            })
        entry["releases"].sort(key=lambda r: r["date"] or "", reverse=True)
        entry["unlisted"] = [f for f in info["albums"] if f not in matched_folders]
    except Exception as e:
        entry["error"] = str(e)
        print(f"  [WARN] Lookup failed for {folder_name}: {e}")
    return entry


def finalise(results):
    artists = results["artists"]
    results["artistsScanned"] = len(artists)
    results["artistsWithMissingReleases"] = sum(
        1 for a in artists.values() if any(not r["owned"] for r in a["releases"])
    )


def run_scan():
    cfg = load_config()
    excluded = {a.lower() for a in cfg["excluded_artists"]}
    musicbrainzngs.set_rate_limit(limit_or_interval=1.0 / cfg["rate_limit_per_sec"], new_requests=1)
    overrides = read_json(ARTISTS_PATH, {})

    write_status(state="running", phase="listing_library", startedAt=now_iso(),
                 currentIndex=0, totalArtists=0, currentArtist=None, lastError=None)
    try:
        library = walk_muzak_library(cfg["muzak_path"], excluded)
    except Exception as e:
        write_status(state="error", lastError=str(e), finishedAt=now_iso())
        print(f"[ERROR] {e}")
        return

    names = sorted(library.keys(), key=str.lower)
    total = len(names)
    write_status(phase="querying_musicbrainz", totalArtists=total)

    artists = {}
    for i, name in enumerate(names):
        write_status(currentIndex=i, currentArtist=name)
        artists[name] = scan_artist(name, library[name], cfg, overrides)
        missing = sum(1 for r in artists[name]["releases"] if not r["owned"])
        print(f"[{i + 1}/{total}] {name}: {len(artists[name]['releases'])} releases, {missing} not owned")

    finished = now_iso()
    results = {"lastScanCompleted": finished, "artists": artists}
    finalise(results)
    write_json_atomic(RESULTS_PATH, results)
    write_status(state="done", phase="finished", currentArtist=None, currentIndex=total,
                 finishedAt=finished, lastError=None)
    print(f"Scan complete: {total} artists.")


def run_single(name):
    cfg = load_config()
    excluded = {a.lower() for a in cfg["excluded_artists"]}
    musicbrainzngs.set_rate_limit(limit_or_interval=1.0 / cfg["rate_limit_per_sec"], new_requests=1)
    overrides = read_json(ARTISTS_PATH, {})

    info = {"genre": "Unknown", "albums": []}
    found = False
    for genre in os.listdir(cfg["muzak_path"]):
        artist_path = os.path.join(cfg["muzak_path"], genre, name)
        if os.path.isdir(artist_path):
            if not found:
                info["genre"] = genre.strip()
            found = True
            for a in os.listdir(artist_path):
                if os.path.isdir(os.path.join(artist_path, a)) and a.strip() not in info["albums"]:
                    info["albums"].append(a.strip())
    if not found:
        print(f"[ERROR] No folder found for artist {name}")
        sys.exit(2)

    results = read_json(RESULTS_PATH, {"lastScanCompleted": None, "artists": {}})
    results.setdefault("artists", {})[name] = scan_artist(name, info, cfg, overrides)
    finalise(results)
    write_json_atomic(RESULTS_PATH, results)
    print("OK")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--artist":
        run_single(sys.argv[2])
    else:
        run_scan()
