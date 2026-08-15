// getUserMedia, facingMode, orientation, permissions, battery — everything
// about owning the camera stream. Nothing about inference lives here.

export const PermissionState = {
  PROMPT: "prompt",
  GRANTED: "granted",
  DENIED: "denied",
  NO_CAMERA: "no-camera",
  UNSUPPORTED: "unsupported",
};

export async function checkPermission() {
  if (!navigator.mediaDevices?.getUserMedia) return PermissionState.UNSUPPORTED;
  if (!navigator.permissions?.query) return PermissionState.PROMPT; // Safari: no Permissions API, ask directly
  try {
    const status = await navigator.permissions.query({ name: "camera" });
    return status.state; // "granted" | "denied" | "prompt"
  } catch {
    return PermissionState.PROMPT;
  }
}

export async function hasCameraDevice() {
  if (!navigator.mediaDevices?.enumerateDevices) return true; // can't tell — don't block on it
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.some((d) => d.kind === "videoinput");
}

export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}

// Throws with a .code matching PermissionState so callers can render the
// right recovery message rather than a generic failure.
export async function startCamera(videoEl, { facingMode = "environment" } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error("Camera not supported in this browser.");
    err.code = PermissionState.UNSUPPORTED;
    throw err;
  }
  if (!(await hasCameraDevice())) {
    const err = new Error("No camera found on this device.");
    err.code = PermissionState.NO_CAMERA;
    throw err;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (err) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      const e = new Error("Camera blocked. Allow camera access in your browser's site settings, then reload.");
      e.code = PermissionState.DENIED;
      throw e;
    }
    if (err.name === "NotFoundError") {
      const e = new Error("No camera found on this device.");
      e.code = PermissionState.NO_CAMERA;
      throw e;
    }
    throw err;
  }

  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function switchFacing(videoEl, stream, currentFacing) {
  stopCamera(stream);
  const next = currentFacing === "environment" ? "user" : "environment";
  const newStream = await startCamera(videoEl, { facingMode: next });
  return { stream: newStream, facing: next };
}

// Pause inference (not the preview) when the tab is hidden, so we don't
// burn battery running a model nobody is looking at.
export function onVisibilityChange(callback) {
  const handler = () => callback(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

// callback(shouldPause, level) — fires on battery change and once immediately.
// Silently no-ops on browsers without the Battery Status API (most non-Chromium
// browsers) rather than treating "unknown" as "fine to keep running full-tilt".
export async function onLowBattery(callback, threshold = 0.15) {
  if (!navigator.getBattery) return () => {};
  const battery = await navigator.getBattery();
  const evaluate = () => callback(!battery.charging && battery.level < threshold, battery.level);
  battery.addEventListener("levelchange", evaluate);
  battery.addEventListener("chargingchange", evaluate);
  evaluate();
  return () => {
    battery.removeEventListener("levelchange", evaluate);
    battery.removeEventListener("chargingchange", evaluate);
  };
}
