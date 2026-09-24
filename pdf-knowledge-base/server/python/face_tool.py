"""Local face detection + embedding for the IMS Look / Faces features.

Usage: python face_tool.py <image.jpg>
Prints one JSON object to stdout:
  {"width": W, "height": H,
   "faces": [{"box": [x, y, w, h], "score": 0.98,
              "embedding": [128 floats, L2-normalised],
              "thumb": "<base64 jpeg, 112x112 aligned face crop>"}]}

Detection is OpenCV's YuNet, recognition is SFace - both run locally on CPU,
nothing leaves this machine. Matching (cosine similarity of embeddings; SFace's
recommended same-person threshold is 0.363) is done by the Node caller.
"""
import sys
import os
import json
import base64
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
YUNET = os.path.join(HERE, "models", "yunet.onnx")
SFACE = os.path.join(HERE, "models", "sface.onnx")


def main(path):
    img = cv2.imread(path)
    if img is None:
        print(json.dumps({"error": "Could not read image"}))
        return 1
    h, w = img.shape[:2]

    # Very large frames slow detection down for no benefit; detect on a
    # downscaled copy and scale results back up.
    scale = 1.0
    longest = max(w, h)
    if longest > 1280:
        scale = 1280.0 / longest
    small = cv2.resize(img, (int(w * scale), int(h * scale))) if scale != 1.0 else img

    detector = cv2.FaceDetectorYN.create(YUNET, "", (small.shape[1], small.shape[0]), 0.8, 0.3, 5000)
    _, dets = detector.detect(small)
    faces = []
    if dets is not None:
        recognizer = cv2.FaceRecognizerSF.create(SFACE, "")
        for d in dets:
            d = d.copy()
            d[:14] = d[:14] / scale  # box + 5 landmarks back to full-frame coordinates
            aligned = recognizer.alignCrop(img, d)
            feat = recognizer.feature(aligned).flatten().astype(np.float64)
            feat = feat / (np.linalg.norm(feat) or 1.0)
            ok, jpg = cv2.imencode(".jpg", aligned, [cv2.IMWRITE_JPEG_QUALITY, 85])
            x, y, bw, bh = [float(v) for v in d[:4]]
            faces.append({
                "box": [max(0.0, x), max(0.0, y), bw, bh],
                "score": float(d[14]),
                "embedding": [round(float(v), 6) for v in feat],
                "thumb": base64.b64encode(jpg.tobytes()).decode("ascii") if ok else None,
            })
    faces.sort(key=lambda f: f["box"][2] * f["box"][3], reverse=True)  # biggest face first
    print(json.dumps({"width": w, "height": h, "faces": faces}))
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: face_tool.py <image>"}))
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
