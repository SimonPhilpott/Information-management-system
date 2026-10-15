"""Simon's own wake-word model (IMS) - trained on his voice through the Box-3 microphone.

Uses openWakeWord's pretrained speech features (melspectrogram -> 96-number embedding every 80 ms) and
trains a small classifier on 16-embedding windows (about 1.3 s) of:
  positives - his wake phrase recordings (Phrases page, Box-3 mic) and real wake checks that woke Ims
  negatives - wake-check clips of other speech and room noise (and anything he marked "not me")

Commands:
  python wakeword.py train  <data.json> <out_dir>    data.json: {"positives": [wav...], "negatives": [wav...]}
  python wakeword.py serve  <model_dir> <port>       POST /score (raw 16 kHz 16-bit mono PCM) -> {"score", "at"}
                                                     POST /reload -> reloads the model after training
It never decides anything in IMS by itself: IMS logs its score beside Gemini's verdict (shadow mode).
"""
import json
import os
import sys
import time
import wave
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

warnings.filterwarnings("ignore")
WINDOW = 16          # embeddings per window (80 ms each -> 1.28 s)
SR = 16000
_features = None


def features():
    global _features
    if _features is None:
        from openwakeword.utils import AudioFeatures
        _features = AudioFeatures(inference_framework="onnx")
    return _features


def read_wav(path):
    with wave.open(path, "rb") as w:
        if w.getframerate() != SR or w.getsampwidth() != 2:
            raise ValueError(f"{path}: needs 16 kHz 16-bit audio")
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        if w.getnchannels() > 1:
            data = data[:: w.getnchannels()]
    return data


def speech_span(x):
    """Start/end sample of the loudest stretch (the phrase), from 20 ms frame energy."""
    f = 320
    n = len(x) // f
    if n < 3:
        return 0, len(x)
    rms = np.sqrt(np.mean(x[: n * f].astype(np.float64).reshape(n, f) ** 2, axis=1))
    floor = np.percentile(rms, 20)
    peak = rms.max()
    thr = floor + 0.25 * (peak - floor)
    on = np.where(rms > thr)[0]
    if not len(on):
        return 0, len(x)
    return max(0, on[0] * f - 1600), min(len(x), (on[-1] + 1) * f + 1600)


def fit_window(x, length, offset=0):
    """The phrase placed in a clip of exactly `length` samples, ending about 150 ms (+offset) before its end."""
    out = np.zeros(length, dtype=np.int16)
    x = x[-(length - 800):]
    end = int(min(length, max(len(x), length - 2400 + offset)))
    out[end - len(x):end] = x
    return out


def embed(x):
    if len(x) < SR * 2:
        x = np.concatenate([np.zeros(SR * 2 - len(x), dtype=np.int16), x])
    return features()._get_embeddings(x)


def windows(emb, step=2):
    if len(emb) < WINDOW:
        return np.zeros((0, WINDOW * emb.shape[1]))
    return np.stack([emb[i:i + WINDOW].reshape(-1) for i in range(0, len(emb) - WINDOW + 1, step)])


def positive_vectors(x, noise_bank, rng):
    """One clean window and augmented copies: shifted, louder/quieter, with room noise mixed in."""
    s, e = speech_span(x)
    phrase = x[s:e]
    length = SR * 2
    vecs = []
    for k in range(12):
        offset = int(rng.integers(-2400, 1600)) if k else 0
        gain = float(rng.uniform(0.5, 1.6)) if k else 1.0
        clip = fit_window(phrase, length, offset).astype(np.float64) * gain
        if k and noise_bank:
            nz = noise_bank[int(rng.integers(len(noise_bank)))]
            if len(nz) >= length:
                st = int(rng.integers(0, len(nz) - length + 1))
                clip += nz[st:st + length].astype(np.float64) * float(rng.uniform(0.3, 1.0))
        clip = np.clip(clip, -32768, 32767).astype(np.int16)
        emb = embed(clip)
        vecs.append(emb[-WINDOW:].reshape(-1))
    return vecs


def train(data_path, out_dir):
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    data = json.load(open(data_path, encoding="utf-8"))
    rng = np.random.default_rng(7)
    pos_files = [p for p in data["positives"] if os.path.exists(p)]
    neg_files = [p for p in data["negatives"] if os.path.exists(p)]
    if len(pos_files) < 5 or len(neg_files) < 10:
        raise SystemExit(json.dumps({"error": f"Need at least 5 wake recordings and 10 other clips (have {len(pos_files)} and {len(neg_files)})."}))
    noise_bank = []
    for p in neg_files[:200]:
        try:
            noise_bank.append(read_wav(p))
        except Exception:
            pass

    X, y, groups = [], [], []
    for gi, p in enumerate(pos_files):
        try:
            for v in positive_vectors(read_wav(p), noise_bank, rng):
                X.append(v); y.append(1); groups.append(gi)
        except Exception as err:
            print(f"skip {p}: {err}", file=sys.stderr)
    for gi, p in enumerate(neg_files):
        try:
            for v in windows(embed(read_wav(p)), step=3):
                X.append(v); y.append(0); groups.append(10000 + gi)
        except Exception as err:
            print(f"skip {p}: {err}", file=sys.stderr)
    X, y, groups = np.array(X), np.array(y), np.array(groups)

    def model():
        return make_pipeline(StandardScaler(), LogisticRegression(C=0.05, class_weight="balanced", max_iter=3000))

    # honest scores: each recording (with its augmented copies) is held out whole, never seen in training
    clip_pos = {},
    pos_scores, neg_scores = [], []
    ug = np.unique(groups)
    folds = min(5, max(2, len(pos_files)))
    labels = np.array([1 if g < 10000 else 0 for g in ug])
    skf = StratifiedKFold(n_splits=folds, shuffle=True, random_state=7)
    for tr_g, te_g in skf.split(ug, labels):
        tr = np.isin(groups, ug[tr_g]); te = np.isin(groups, ug[te_g])
        m = model().fit(X[tr], y[tr])
        p = m.predict_proba(X[te])[:, 1]
        for g in np.unique(groups[te]):
            s = p[groups[te] == g]
            (pos_scores if g < 10000 else neg_scores).append(float(s[0] if g < 10000 else s.max()))
    pos_scores, neg_scores = np.array(pos_scores), np.array(neg_scores)
    # threshold: above every "not a wake" clip seen (with a little room), but no higher than it needs to be
    thr = float(min(0.95, max(0.5, (neg_scores.max() if len(neg_scores) else 0.5) + 0.02)))
    recall = float((pos_scores >= thr).mean()) if len(pos_scores) else 0.0
    false_wakes = int((neg_scores >= thr).sum())

    final = model().fit(X, y)
    os.makedirs(out_dir, exist_ok=True)
    import joblib
    joblib.dump(final, os.path.join(out_dir, "model.joblib"))
    meta = {
        "trainedAt": int(time.time() * 1000), "threshold": round(thr, 3),
        "positives": len(pos_files), "negatives": len(neg_files),
        "heldOutRecall": round(recall, 3), "heldOutFalseWakes": false_wakes, "heldOutNegatives": int(len(neg_scores)),
        "positiveScores": [round(float(s), 3) for s in sorted(pos_scores)],
        "worstNegative": round(float(neg_scores.max()), 3) if len(neg_scores) else None,
    }
    json.dump(meta, open(os.path.join(out_dir, "meta.json"), "w"))
    print(json.dumps(meta))


class Scorer:
    def __init__(self, model_dir):
        self.dir = model_dir
        self.load()

    def load(self):
        import joblib
        p = os.path.join(self.dir, "model.joblib")
        self.model = joblib.load(p) if os.path.exists(p) else None
        mp = os.path.join(self.dir, "meta.json")
        self.meta = json.load(open(mp)) if os.path.exists(mp) else {}

    def score(self, pcm):
        if self.model is None:
            return {"score": None, "error": "no model trained yet"}
        x = np.frombuffer(pcm, dtype=np.int16)
        t0 = time.time()
        w = windows(embed(x), step=1)
        if not len(w):
            return {"score": 0.0}
        p = self.model.predict_proba(w)[:, 1]
        i = int(np.argmax(p))
        lead = max(0, SR * 2 - len(x)) / SR  # padding added in front of short clips
        at = (i + WINDOW) * 0.08 - lead
        speech, quiet_after = utterance_around(x, at)
        return {"score": round(float(p[i]), 4), "at": round(at, 2), "speechSec": speech, "quietAfterSec": quiet_after,
                "threshold": self.meta.get("threshold"), "ms": int((time.time() - t0) * 1000)}


def utterance_around(x, at):
    """How long the stretch of speech ending near `at` seconds lasted, and the quiet after it - a wake
    phrase is short and followed by a pause; ordinary conversation runs on."""
    f = 320  # 20 ms
    n = len(x) // f
    if n < 5:
        return 0.0, 0.0
    rms = np.sqrt(np.mean(x[: n * f].astype(np.float64).reshape(n, f) ** 2, axis=1))
    floor = np.percentile(rms, 20)
    loud = rms > max(floor * 2.5, floor + 150)
    # bridge gaps under 300 ms (between words)
    idx = np.where(loud)[0]
    if not len(idx):
        return 0.0, round(n * 0.02, 2)
    k = int(min(n - 1, max(0, round(at / 0.02))))
    near = idx[np.argmin(np.abs(idx - k))]
    start = end = near
    while True:
        prev = idx[idx < start]
        if len(prev) and start - prev[-1] <= 15:
            start = prev[-1]
        else:
            break
    while True:
        nxt = idx[idx > end]
        if len(nxt) and nxt[0] - end <= 15:
            end = nxt[0]
        else:
            break
    after = idx[idx > end]
    quiet_after = ((after[0] if len(after) else n) - end - 1) * 0.02
    return round((end - start + 1) * 0.02, 2), round(quiet_after, 2)


def serve(model_dir, port):
    scorer = Scorer(model_dir)
    features()  # load the feature models once

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self._send(200, {"ok": True, "model": scorer.model is not None, "meta": scorer.meta})

        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else b""
            try:
                if self.path == "/reload":
                    scorer.load()
                    return self._send(200, {"ok": True, "model": scorer.model is not None, "meta": scorer.meta})
                if self.path == "/score":
                    return self._send(200, scorer.score(body))
                self._send(404, {"error": "unknown"})
            except Exception as err:
                self._send(500, {"error": str(err)})

    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "train":
        train(sys.argv[2], sys.argv[3])
    elif cmd == "serve":
        serve(sys.argv[2], int(sys.argv[3]))
    else:
        print(__doc__)
