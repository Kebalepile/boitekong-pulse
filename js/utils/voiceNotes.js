const PREFERRED_VOICE_NOTE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus"
];

export function isVoiceNoteRecordingSupported() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return (
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function getSupportedVoiceNoteMimeType() {
  if (!isVoiceNoteRecordingSupported()) {
    return null;
  }

  if (typeof window.MediaRecorder?.isTypeSupported !== "function") {
    return PREFERRED_VOICE_NOTE_MIME_TYPES[0];
  }

  return (
    PREFERRED_VOICE_NOTE_MIME_TYPES.find((mimeType) =>
      window.MediaRecorder.isTypeSupported(mimeType)
    ) || null
  );
}

export function getVoiceNoteFeatureStatus() {
  const supported = isVoiceNoteRecordingSupported();

  return {
    supported,
    mimeType: getSupportedVoiceNoteMimeType(),
    message: supported
      ? "Voice notes are the next phase. They will be recorded in-browser with MediaRecorder."
      : "Voice notes are planned next, but this browser may need MediaRecorder support."
  };
}
