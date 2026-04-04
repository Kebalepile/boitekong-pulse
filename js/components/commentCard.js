import { createElement } from "../utils/dom.js";
import { formatVoiceNoteDuration, configureVoiceNoteAudio } from "../utils/voiceNotes.js";
import { createVoiceNoteVisualizer } from "../utils/voiceNoteVisualizer.js";

export function createCommentCard(comment, author, options = {}) {
  const {
    isReply = false,
    repliesCount = 0,
    repliesExpanded = false,
    reactionBar = null,
    onReply = null,
    onToggleReplies = null,
    onEdit = null,
    onDelete = null
  } = options;

  const card = createElement("div", {
    className: `comment-card${isReply ? " comment-card-reply" : ""}`
  });

  const header = createElement("div", { className: "comment-card-header" });
  const authorName = createElement("strong", {
    className: "comment-author",
    text: author?.username || "Unknown User"
  });
  const meta = createElement("span", {
    className: "comment-meta",
    text: formatCommentMeta(comment)
  });

  header.append(authorName, meta);

  card.appendChild(header);

  if (comment.content) {
    const content = createElement("p", {
      className: "comment-content",
      text: comment.content
    });

    card.appendChild(content);
  }

  if (reactionBar) {
    card.appendChild(reactionBar);
  }

  const actionConfigs = [
    { label: "\u21A9 Reply", className: "comment-action-btn", onClick: onReply },
    {
      label: repliesExpanded
        ? `\u25B4 Hide replies (${repliesCount})`
        : `\u25BE Show replies (${repliesCount})`,
      className: "comment-action-btn comment-replies-toggle-btn",
      onClick: repliesCount > 0 ? onToggleReplies : null
    },
    { label: "\u270E Edit", className: "comment-action-btn", onClick: onEdit },
    {
      label: "\u{1F5D1} Delete",
      className: "comment-action-btn comment-action-danger",
      onClick: onDelete
    }
  ].filter((action) => typeof action.onClick === "function");

  if (actionConfigs.length > 0) {
    const actions = createElement("div", { className: "comment-card-actions" });

    actionConfigs.forEach(({ label, className, onClick }) => {
      const actionBtn = createElement("button", {
        className,
        type: "button",
        text: label
      });

      if (className.includes("comment-replies-toggle-btn")) {
        let isExpanded = repliesExpanded;

        actionBtn.addEventListener("click", () => {
          onClick();
          isExpanded = !isExpanded;
          actionBtn.textContent = getRepliesToggleLabel(isExpanded, repliesCount);
        });
      } else {
        actionBtn.addEventListener("click", onClick);
      }

      actions.appendChild(actionBtn);
    });

    card.appendChild(actions);
  }

  if (comment.voiceNote?.dataUrl) {
    card.appendChild(createVoiceNotePlayer(comment.voiceNote));
  }

  return card;
}

function getRepliesToggleLabel(isExpanded, repliesCount) {
  return isExpanded
    ? `\u25B4 Hide replies (${repliesCount})`
    : `\u25BE Show replies (${repliesCount})`;
}

function createVoiceNotePlayer(voiceNote) {
  const block = createElement("div", {
    className: "comment-voice-note voice-note-composer voice-note-player"
  });
  const controls = createElement("div", { className: "voice-note-controls" });
  const playBtn = createElement("button", {
    className: "secondary-btn voice-note-btn voice-note-icon-btn",
    type: "button",
    text: "\u25B6",
    attributes: {
      "aria-label": "Play voice note",
      title: "Play voice note"
    }
  });
  const stopBtn = createElement("button", {
    className: "secondary-btn voice-note-btn voice-note-icon-btn",
    type: "button",
    text: "\u25A0",
    attributes: {
      "aria-label": "Stop voice note",
      title: "Stop voice note"
    }
  });

  const meter = createElement("div", { className: "voice-note-meter" });
  const indicator = createElement("span", {
    className: "voice-note-indicator",
    text: "\u{1F50A}"
  });
  const waveform = createElement("div", { className: "voice-note-waveform" });
  const progressLine = createElement("span", { className: "voice-note-progress-line" });
  const timer = createElement("p", {
    className: "voice-note-timer",
    text: `${formatVoiceNoteDuration(voiceNote.durationMs)} voice note`
  });
  const status = createElement("p", {
    className: "voice-note-status",
    text: "\u{1F50A} Tap play to hear this voice note."
  });

  waveform.appendChild(progressLine);
  meter.append(indicator, waveform, timer);

  const audio = document.createElement("audio");
  audio.className = "comment-voice-audio";
  configureVoiceNoteAudio(audio, voiceNote.dataUrl);

  const visualizer = createVoiceNoteVisualizer({
    waveformElement: waveform,
    progressLineElement: progressLine
  });
  const totalDurationSeconds = Math.max(voiceNote.durationMs / 1000, 0);

  const syncPlayer = () => {
    const isPlaying = !audio.paused && !audio.ended;
    const progressRatio = totalDurationSeconds > 0 ? audio.currentTime / totalDurationSeconds : 0;

    meter.classList.toggle("voice-note-meter-recording", isPlaying);
    playBtn.textContent = isPlaying ? "\u23F8" : "\u25B6";
    playBtn.setAttribute("aria-label", isPlaying ? "Pause voice note" : "Play voice note");
    playBtn.title = isPlaying ? "Pause voice note" : "Play voice note";
    stopBtn.disabled = !isPlaying && audio.currentTime === 0;

    visualizer.renderStoredWaveform({
      waveform: voiceNote.waveform,
      progressRatio
    });

    if (isPlaying) {
      status.textContent = "\u{1F50A} Playing voice note...";
      timer.textContent = `${formatVoiceNoteDuration(audio.currentTime * 1000)} / ${formatVoiceNoteDuration(voiceNote.durationMs)}`;
      return;
    }

    status.textContent = "\u{1F50A} Tap play to hear this voice note.";
    timer.textContent =
      audio.currentTime > 0
        ? `${formatVoiceNoteDuration(audio.currentTime * 1000)} / ${formatVoiceNoteDuration(voiceNote.durationMs)}`
        : `${formatVoiceNoteDuration(voiceNote.durationMs)} voice note`;
  };

  playBtn.addEventListener("click", async () => {
    try {
      if (audio.paused || audio.ended) {
        if (audio.ended) {
          audio.currentTime = 0;
        }

        await audio.play();
      } else {
        audio.pause();
      }

      syncPlayer();
    } catch {
      status.textContent = "\u{1F50A} Could not play this voice note right now.";
    }
  });

  stopBtn.addEventListener("click", () => {
    audio.pause();
    audio.currentTime = 0;
    syncPlayer();
  });

  ["play", "pause", "ended", "timeupdate", "loadedmetadata"].forEach((eventName) => {
    audio.addEventListener(eventName, syncPlayer);
  });

  syncPlayer();
  controls.append(playBtn, stopBtn);
  block.append(controls, meter, status, audio);

  return block;
}

function formatCommentMeta(comment) {
  const baseText = formatTimestamp(comment.createdAt);
  return comment.updatedAt ? `${baseText} | Edited` : baseText;
}

function formatTimestamp(isoDate) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
