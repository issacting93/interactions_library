/* shared/mechanisms/gaze-camera.js — "is anyone looking at the screen?", from a camera.
   A mechanism, not a look: MediaPipe's Face Landmarker watches the webcam and says whether any face
   is turned towards the screen with its eyes open. Feed it into watch.js and a piece that freezes
   while watched now freezes while a person looks at it, and moves when they turn away — or blink.

   Looking means, for at least one face:
     facing   head turned less than `yaw` degrees sideways and `pitch` degrees up or down
              (a little wider while already looking, so it does not flicker at the edge)
     open     both eyes open (MediaPipe's eyeBlink blendshapes under `closed`)
   Not looking: no face, every face turned away, or eyes shut for longer than `blinkMs` —
   a real blink is ~100–300 ms, so a blink counts as looking away.

     const cam = await GazeCamera.start({ onChange(looking, cam) {}, onFrame(cam) {} });
     cam.looking   -> true | false
     cam.faces     -> [{ x, y, yaw, pitch, open, facing }]  x, y: 0..1 of the frame, mirrored like a selfie
     cam.video     -> the <video> it reads (unattached; put it on the page to show a preview)
     cam.stop()
   Rejects if there is no camera, permission is refused, or MediaPipe cannot load.
   Loads MediaPipe from jsDelivr and the face model from Google's model storage (opts.wasm / opts.model
   to host them yourself). Video stays in the browser; nothing is sent anywhere.
   Classic script, no dependencies. */
(function () {
  "use strict";
  const VERSION = "0.10.21";
  const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
  const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  const DEG = 180 / Math.PI;

  async function start(opts) {
    opts = Object.assign({ yaw: 24, pitch: 20, closed: 0.5, blinkMs: 70, maxFaces: 4, wasm: BASE + "/wasm", model: MODEL, bundle: BASE + "/vision_bundle.mjs" }, opts || {});
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("No camera access in this browser");
    // ask for the camera first: a refusal should not wait on a model download
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    let landmarker;
    try {
      await video.play();
      const vision = await import(opts.bundle);
      const files = await vision.FilesetResolver.forVisionTasks(opts.wasm);
      const make = (delegate) => vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: opts.model, delegate }, runningMode: "VIDEO", numFaces: opts.maxFaces,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
      try { landmarker = await make("GPU"); } catch (e) { landmarker = await make("CPU"); }
    } catch (e) { stream.getTracks().forEach((t) => t.stop()); throw e; }

    const cam = { looking: false, faces: [], video, stop };
    let raf = 0, lastT = -1, awaySince = null, stopped = false;

    function score(cats, name) { const c = cats.find((k) => k.categoryName === name); return c ? c.score : 0; }
    function read(res) {
      const wide = cam.looking ? 1.25 : 1;
      return (res.faceLandmarks || []).map((lm, i) => {
        // the face's forward axis from its transform (column-major 4x4): how far it is turned away
        const m = res.facialTransformationMatrixes && res.facialTransformationMatrixes[i] ? res.facialTransformationMatrixes[i].data : null;
        const yaw = m ? Math.atan2(m[8], m[10]) * DEG : 0, pitch = m ? Math.asin(Math.max(-1, Math.min(1, -m[9]))) * DEG : 0;
        const cats = res.faceBlendshapes && res.faceBlendshapes[i] ? res.faceBlendshapes[i].categories : [];
        const open = Math.max(score(cats, "eyeBlinkLeft"), score(cats, "eyeBlinkRight")) < opts.closed;
        const facing = Math.abs(yaw) < opts.yaw * wide && Math.abs(pitch) < opts.pitch * wide;
        const nose = lm[1] || lm[0];
        return { x: 1 - nose.x, y: nose.y, yaw, pitch, open, facing };
      });
    }
    function tick() {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (video.readyState < 2 || video.currentTime === lastT) return;
      lastT = video.currentTime;
      const now = performance.now();
      cam.faces = read(landmarker.detectForVideo(video, now));
      const seen = cam.faces.some((f) => f.facing && f.open);
      // looking starts at once; it ends only after blinkMs of nobody looking (a blink still counts)
      let looking = cam.looking;
      if (seen) { awaySince = null; looking = true; }
      else { if (awaySince === null) awaySince = now; if (now - awaySince >= opts.blinkMs) looking = false; }
      if (looking !== cam.looking) { cam.looking = looking; if (opts.onChange) opts.onChange(looking, cam); }
      if (opts.onFrame) opts.onFrame(cam);
    }
    function stop() {
      stopped = true; cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      try { landmarker.close(); } catch (e) {}
      if (cam.looking) { cam.looking = false; if (opts.onChange) opts.onChange(false, cam); }
    }
    raf = requestAnimationFrame(tick);
    return cam;
  }

  window.GazeCamera = { start };
})();
