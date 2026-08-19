import React, { useEffect, useRef, useState } from "react";
import { Camera, Send, Mic, X, Copy, Check } from "lucide-react";
import { api } from "../api.js";

function fileToPreviewUrl(file) {
  return file?.type?.startsWith("image/") ? URL.createObjectURL(file) : null;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function inferMealType() {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 18) return "snack";
  return "dinner";
}

const SpeechRecognitionCtor =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const speechSupported = Boolean(SpeechRecognitionCtor);
const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export default function Chat({ onAction, starterPrompt = "", onStarterPromptConsumed }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const logRef = useRef(null);
  const fileInputRef = useRef(null);

  const [voiceMode, setVoiceMode] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [listeningStatus, setListeningStatus] = useState("");
  const [voiceError, setVoiceError] = useState(null);
  const recognitionRef = useRef(null);
  const voiceModeRef = useRef(false);
  const pausedForSpeechRef = useRef(false);

  useEffect(() => {
    api.getChatHistory().then(setHistory);
  }, []);

  useEffect(() => {
    if (!starterPrompt || !starterPrompt.trim()) return;

    const prompt = starterPrompt.trim();
    setInput("");
    send(prompt);
    onStarterPromptConsumed?.();
  }, [starterPrompt, onStarterPromptConsumed]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [history]);

  // One box, one submit path — a photo attached (with or without text) goes
  // through the food-check flow; text alone goes through the tool-calling
  // chat flow. Replaces what used to be two separate cards.
  async function send(overrideMessage, overridePhoto) {
    const isOverride = overrideMessage !== undefined;
    const message = (overrideMessage ?? input).trim();
    const attachedPhoto = isOverride ? overridePhoto ?? null : photo;
    if (!message && !attachedPhoto) return;
    if (sending) return;
    setError(null);
    setInput("");
    setPhoto(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const bubbleId = `${Date.now()}-${Math.random()}`;
    let photoDataUrl = null;
    if (attachedPhoto) {
      try {
        photoDataUrl = await fileToDataUrl(attachedPhoto);
      } catch {
        // couldn't read the file for a persisted preview — the food-check call below still works
      }
    }
    setHistory((h) => [
      ...h,
      {
        role: "user",
        content: message || "Should I eat this? (photo attached)",
        rawMessage: message,
        photo: attachedPhoto,
        photoDataUrl,
        id: bubbleId,
      },
    ]);
    setSending(true);
    try {
      if (attachedPhoto) {
        const { reply } = await api.foodCheck({ description: message, photo: attachedPhoto });
        setHistory((h) => [...h, { role: "assistant", content: reply }]);
        setHistory((h) => h.map((entry) => (entry.id === bubbleId ? { ...entry, assistantReply: reply } : entry)));
        speakReply(reply);
      } else {
        const { reply, actions } = await api.sendChatMessage(message);
        setHistory((h) => [...h, { role: "assistant", content: reply }]);
        speakReply(reply);
        actions?.forEach((action) => onAction?.(action));
      }
    } catch (err) {
      setError(err.message);
      // Leave the bubble in place but mark it failed instead of silently
      // dropping it — otherwise a retry just stacks another identical bubble
      // with no sign the first one never got a reply.
      setHistory((h) => h.map((m) => (m.id === bubbleId ? { ...m, failed: true } : m)));
    } finally {
      setSending(false);
    }
  }

  function retry(m) {
    setHistory((h) => h.filter((entry) => entry.id !== m.id));
    send(m.rawMessage ?? m.content, m.photo);
  }

  // The photo sent to "should I eat this?" only gets the AI's verdict back —
  // it isn't recorded anywhere. This lets that same photo be saved to the
  // Food diary without having to re-attach it in the Log a meal box.
  async function logToDiary(m) {
    if (!m.photoDataUrl || m.loggingToDiary || m.loggedToDiary) return;
    setHistory((h) => h.map((entry) => (entry.id === m.id ? { ...entry, loggingToDiary: true } : entry)));
    try {
      const calMatch = m.assistantReply?.match(/~?\s*(\d{2,4})\s*(?:kcal|cal(?:ories)?)\b/i);
      await api.addFoodLog({
        mealType: inferMealType(),
        summary: m.rawMessage?.trim() || m.assistantReply?.slice(0, 140) || "Photo logged from coach chat",
        calories: calMatch ? Number(calMatch[1]) : null,
        photoDataUrl: m.photoDataUrl,
      });
      setHistory((h) =>
        h.map((entry) => (entry.id === m.id ? { ...entry, loggingToDiary: false, loggedToDiary: true } : entry))
      );
    } catch (err) {
      setHistory((h) => h.map((entry) => (entry.id === m.id ? { ...entry, loggingToDiary: false } : entry)));
      setError(err.message);
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0] || null;
    setPhoto(file);
    setPreview(fileToPreviewUrl(file));
  }

  function clearPhoto() {
    setPhoto(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Lets a screenshot/print-screen copied to the OS clipboard be attached
  // just by pasting into the message box (Ctrl+V) — same attach path as the
  // camera-icon file picker, just a faster way in for anyone who already has
  // an image on their clipboard instead of a saved file to browse to.
  async function copyMessage(m, key) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(m.content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = m.content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedId(key);
      setTimeout(() => setCopiedId((current) => (current === key ? null : current)), 1500);
    } catch {
      // clipboard access denied/unavailable — nothing to fall back to, just leave it uncopied
    }
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type?.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          setPhoto(file);
          setPreview(fileToPreviewUrl(file));
        }
        return;
      }
    }
    // no image on the clipboard — let the browser's normal text paste happen
  }

  function speak(text, onDone) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (onDone) utterance.onend = onDone;
    window.speechSynthesis.speak(utterance);
  }

  // Speaks a reply, muting the microphone first if voice mode is listening —
  // otherwise, with no wake phrase to filter it out, the coach's own voice
  // coming back through the mic would get sent right back as a new message.
  function speakReply(text) {
    if (!speakReplies || !ttsSupported) return;
    if (voiceModeRef.current && recognitionRef.current) {
      pausedForSpeechRef.current = true;
      recognitionRef.current.stop();
      speak(text, () => {
        pausedForSpeechRef.current = false;
        if (voiceModeRef.current) {
          try {
            recognitionRef.current?.start();
          } catch {
            // already starting — ignore
          }
        }
      });
    } else {
      speak(text);
    }
  }

  function startVoiceMode() {
    if (!speechSupported) return;
    setVoiceError(null);
    voiceModeRef.current = true;
    setVoiceMode(true);

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          const question = transcript.trim();
          if (question) {
            setListeningStatus("");
            send(question);
          }
        } else {
          interim = transcript;
        }
      }
      if (interim) setListeningStatus(`"${interim}"`);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setVoiceError("Microphone access was denied — allow it in your browser to use voice mode.");
        stopVoiceMode();
      }
      // other errors (e.g. transient "no-speech") are swallowed — onend restarts listening
    };

    recognition.onend = () => {
      if (voiceModeRef.current && !pausedForSpeechRef.current) {
        try {
          recognition.start();
        } catch {
          // already starting — ignore
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListeningStatus("Listening...");
    } catch (err) {
      setVoiceError("Couldn't start the microphone.");
      voiceModeRef.current = false;
      setVoiceMode(false);
    }
  }

  function stopVoiceMode() {
    voiceModeRef.current = false;
    pausedForSpeechRef.current = false;
    setVoiceMode(false);
    setListeningStatus("");
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
  }

  useEffect(() => () => stopVoiceMode(), []);

  async function clear() {
    await api.clearChat();
    setHistory([]);
  }

  return (
    <div className="card">
      <h2>Coach chat</h2>
      {error && <div className="error-banner">{error}</div>}
      <div className="chat-log" ref={logRef}>
        {history.length === 0 && (
          <p className="muted">
            Ask about portion sizes, what to eat for your condition, or how to start exercising.
          </p>
        )}
        {history.map((m, i) => {
          const bubbleKey = m.id ?? i;
          return (
            <div key={bubbleKey} className={`chat-bubble ${m.role}${m.failed ? " failed" : ""}`}>
              {m.photoDataUrl && (
                <img
                  src={m.photoDataUrl}
                  alt=""
                  style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, marginBottom: 6, display: "block" }}
                />
              )}
              <div className="chat-bubble-row">
                <span className="chat-bubble-text">{m.content}</span>
                <button
                  type="button"
                  className="chat-bubble-copy"
                  onClick={() => copyMessage(m, bubbleKey)}
                  title="Copy message"
                  aria-label="Copy message"
                >
                  {copiedId === bubbleKey ? (
                    <Check size={13} strokeWidth={2.25} />
                  ) : (
                    <Copy size={13} strokeWidth={2.25} />
                  )}
                </button>
              </div>
              {m.failed && (
                <button type="button" className="chat-bubble-retry" onClick={() => retry(m)}>
                  Failed to send — tap to retry
                </button>
              )}
              {m.photoDataUrl && !m.failed && (
                <button
                  type="button"
                  className="secondary small-button"
                  style={{ marginTop: 6 }}
                  onClick={() => logToDiary(m)}
                  disabled={m.loggingToDiary || m.loggedToDiary}
                >
                  {m.loggedToDiary ? "Saved to food diary" : m.loggingToDiary ? "Saving..." : "Log to food diary"}
                </button>
              )}
            </div>
          );
        })}
        {sending && <div className="chat-bubble assistant muted">Thinking...</div>}
      </div>

      {preview && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <img src={preview} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} />
          <span className="muted" style={{ fontSize: "0.8rem" }}>Attached — add a note or just send to ask "should I eat this?"</span>
          <button
            type="button"
            onClick={clearPhoto}
            style={{ background: "none", border: "none", color: "var(--critical)", cursor: "pointer", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <X size={14} strokeWidth={2.25} /> Remove
          </button>
        </div>
      )}

      <div className="meal-search" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="meal-search-icon"
          onClick={() => fileInputRef.current?.click()}
          title="Attach food photo"
          aria-label="Attach food photo"
        >
          <Camera size={18} strokeWidth={2.25} />
        </button>
        <input
          className="meal-search-input"
          value={input}
          placeholder={photo ? "Optional note about this photo..." : "Ask your coach, or paste/attach a food photo..."}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          onPaste={handlePaste}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={handleFile}
        />
        <button type="button" className="meal-search-submit" onClick={() => send()} disabled={sending}>
          <Send size={16} strokeWidth={2.25} color="#fff" />
        </button>
      </div>
      <p className="muted" style={{ marginTop: 4, fontSize: "0.78rem" }}>
        Tip: copied a screenshot? Click the message box and paste (Ctrl/Cmd+V) to attach it directly.
      </p>

      <div className="chat-action-row" style={{ marginTop: 8 }}>
        <button className="secondary small-button" onClick={() => send("I just drank 1 cup of water.")}>+ Drink water</button>
        <button className="secondary small-button" onClick={() => send("Log my latest meal and estimate the calories.")}>+ Log meal</button>
      </div>

      {speechSupported && (
        <div style={{ marginTop: 10, padding: 10, background: "var(--page)", borderRadius: 8 }}>
          {!voiceMode ? (
            <button className="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={startVoiceMode}>
              <Mic size={15} strokeWidth={2.25} /> Start voice mode
            </button>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Mic size={17} strokeWidth={2.25} color="var(--series-1)" />
                <span className="muted">{listeningStatus || "Listening..."}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <button className="secondary" onClick={stopVoiceMode}>Stop voice mode</button>
                {ttsSupported && (
                  <label style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} />
                    Speak replies
                  </label>
                )}
              </div>
            </>
          )}
          {voiceError && <div className="error-banner" style={{ marginTop: 8 }}>{voiceError}</div>}
          <p className="muted" style={{ marginTop: 6, fontSize: "0.78rem" }}>
            Just say your question — it's sent as soon as you pause, no wake word needed. The mic
            automatically mutes itself while the coach is speaking back, so it doesn't hear (and
            resend) its own reply. Only works while this tab is open and focused — not a background
            wake word like Siri.
          </p>
        </div>
      )}

      {history.length > 0 && (
        <button className="secondary" style={{ marginTop: 10 }} onClick={clear}>
          Clear conversation
        </button>
      )}
      <p className="disclaimer">
        This coach offers general lifestyle guidance, not medical advice. Consult a healthcare
        professional for diagnosis or treatment decisions.
      </p>
    </div>
  );
}
