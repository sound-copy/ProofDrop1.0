import sys, json, os
import cv2
import numpy as np
from imwatermark import WatermarkEncoder, WatermarkDecoder

def to_bgr3(img):
    if img is None:
        raise RuntimeError("failed to read image")
    if len(img.shape) == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:
        img = img[:, :, :3]
    return img

def image_embed(inp, msg, outp):
    wm = msg.encode("utf-8")
    enc = WatermarkEncoder()
    enc.set_watermark('bytes', wm)
    img = cv2.imread(inp, cv2.IMREAD_UNCHANGED)
    img = to_bgr3(img)
    enc_img = enc.encode(img, 'dwtDct')
    cv2.imwrite(outp, enc_img)

def image_extract(inp):
    img = cv2.imread(inp, cv2.IMREAD_UNCHANGED)
    img = to_bgr3(img)
    try:
        dec = WatermarkDecoder('bytes', 0)
        wm = dec.decode(img, 'dwtDct')
        s = wm.decode('utf-8', errors='ignore')
        if s:
            print(s); sys.stdout.flush(); return
    except: pass
    try:
        dec = WatermarkDecoder('bytes', 256)
        wm = dec.decode(img, 'dwtDct')
        s = wm.decode('utf-8', errors='ignore')
        print(s)
    except:
        print("")
    sys.stdout.flush()

def video_frames(inp, msg, outdir):
    os.makedirs(outdir, exist_ok=True)
    cap = cv2.VideoCapture(inp)
    if not cap.isOpened():
        raise RuntimeError("cannot open video")
    fps = cap.get(cv2.CAP_PROP_FPS)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    orientation = 'vertical' if h > w else 'horizontal'
    wm = msg.encode("utf-8")
    enc = WatermarkEncoder()
    enc.set_watermark('bytes', wm)
    i = 0
    while True:
        ret, frame = cap.read()
        if not ret: break
        frame = to_bgr3(frame)
        enc_img = enc.encode(frame, 'dwtDct')
        cv2.imwrite(os.path.join(outdir, f"f_{i:06d}.png"), enc_img)
        i += 1
    cap.release()
    meta = {"fps": int(round(fps)) if fps>0 else 30, "orientation": orientation}
    print(json.dumps(meta)); sys.stdout.flush()

if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "image-embed":
        image_embed(sys.argv[2], sys.argv[3], sys.argv[4])
    elif mode == "image-extract":
        image_extract(sys.argv[2])
    elif mode == "video-frames":
        video_frames(sys.argv[2], sys.argv[3], sys.argv[4])

