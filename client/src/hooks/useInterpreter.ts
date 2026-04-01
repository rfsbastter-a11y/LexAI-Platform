import { useState, useRef, useCallback, useEffect } from 'react';
import { getAuthHeaders } from '@/lib/queryClient';

export type InterpreterMode = "neural" | "phonetic" | "teleprompter";

export interface InterpreterResult {
  ptText: string;
  translationLiteral: string;
  translationPolished: string;
  phonetic: string;
  ptBack: string;
}

export interface EnListenResult {
  enText: string;
  ptTranslation: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: { readonly isFinal: boolean; readonly length: number; [n: number]: { readonly transcript: string } };
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const win = window as Record<string, unknown>;
  return (win.SpeechRecognition || win.webkitSpeechRecognition) as ((new () => SpeechRecognitionInstance) | null);
}

interface UseInterpreterProps {
  meetingType?: string;
}

export function useInterpreter({ meetingType }: UseInterpreterProps = {}) {
  const [mode, setMode] = useState<InterpreterMode | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPtText, setCurrentPtText] = useState("");
  const [resultsByMode, setResultsByMode] = useState<Record<InterpreterMode, InterpreterResult | null>>({
    neural: null,
    phonetic: null,
    teleprompter: null,
  });
  const [error, setError] = useState<string | null>(null);

  const [isListeningEN, setIsListeningEN] = useState(false);
  const [showListeningPanel, setShowListeningPanel] = useState(false);
  const [currentEnText, setCurrentEnText] = useState("");
  const [latestEnResult, setLatestEnResult] = useState<EnListenResult | null>(null);

  // Mode 1 (Neural): MediaRecorder for Whisper-quality transcription
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Modes 2 & 3: SpeechRecognition for real-time continuous feedback
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // EN→PT listening: MediaRecorder-based (separate from SpeechRecognition)
  // This allows true concurrent operation with modes 2/3 SpeechRecognition
  // since MediaRecorder and SpeechRecognition use different browser audio pipelines.
  const enMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const enMicStreamRef = useRef<MediaStream | null>(null);

  // Tracks WHICH capture mechanism actually started (not which mode is selected)
  const activeCaptureTypeRef = useRef<"neural" | "speech" | null>(null);

  const isCapturingRef = useRef(false);
  const isListeningENRef = useRef(false);
  const meetingTypeRef = useRef(meetingType);
  meetingTypeRef.current = meetingType;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const playTTS = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ text, voice: 'onyx' }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play().catch(err => console.error('[useInterpreter] Audio play error:', err));
    } catch (err) {
      console.error('[useInterpreter] TTS error:', err);
    }
  }, []);

  const fetchWithRetry = useCallback(async (url: string, options: RequestInit, maxRetries = 2): Promise<Response> => {
    let lastResponse: Response | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, options);
      lastResponse = res;
      if (res.status === 429 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return res;
    }
    return lastResponse!;
  }, []);

  const callInterpret = useCallback(async (text: string) => {
    // Snapshot mode and meetingType BEFORE any async work so mode-switches mid-flight
    // don't cause cross-mode result misattribution or unintended TTS.
    const requestMode = modeRef.current;
    const requestMeetingType = meetingTypeRef.current;
    if (!text.trim() || !requestMode) return;
    setIsProcessing(true);
    try {
      const res = await fetchWithRetry('/api/ai/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ text, mode: requestMode, meetingType: requestMeetingType }),
      });
      if (!res.ok) {
        const msg = res.status === 429
          ? "Limite de requisições atingido — tente novamente em instantes."
          : `Erro ao traduzir (${res.status}) — tente novamente.`;
        setError(msg);
        return;
      }
      setError(null);
      const data = await res.json();
      const result: InterpreterResult = {
        ptText: text,
        translationLiteral: data.translationLiteral || "",
        translationPolished: data.translationPolished || "",
        phonetic: data.phonetic || "",
        ptBack: data.ptBack || "",
      };
      setResultsByMode(prev => ({ ...prev, [requestMode]: result }));

      if (requestMode === "neural" && result.translationLiteral) {
        await playTTS(result.translationLiteral);
      }
    } catch (err) {
      console.error('[useInterpreter] interpret error:', err);
      setError("Erro inesperado — tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  }, [playTTS, fetchWithRetry]);

  // ── MODE 1 (Neural): push-to-talk via MediaRecorder → Whisper ──────────
  const startNeuralCapture = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(500);
      mediaRecorderRef.current = recorder;
      isCapturingRef.current = true;
      activeCaptureTypeRef.current = "neural";
      setIsCapturing(true);
    } catch (err) {
      console.error('[useInterpreter] getUserMedia error:', err);
      setError("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  }, []);

  const stopNeuralCapture = useCallback(async () => {
    isCapturingRef.current = false;
    activeCaptureTypeRef.current = null;
    setIsCapturing(false);

    const recorder = mediaRecorderRef.current;
    const stream = micStreamRef.current;
    mediaRecorderRef.current = null;
    micStreamRef.current = null;

    if (!recorder) return;

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { resolve(); }
    });

    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    if (stream) stream.getTracks().forEach(t => t.stop());

    if (chunks.length === 0) return;

    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    if (blob.size < 1000) return;

    setIsProcessing(true);
    setCurrentPtText("Transcrevendo...");
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const transcribeRes = await fetch('/api/ai/whisper-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ audioBase64: base64, mimeType: blob.type }),
      });

      if (!transcribeRes.ok) {
        const msg = transcribeRes.status === 429
          ? "Limite de requisições atingido — aguarde e tente novamente."
          : `Erro ao transcrever áudio (${transcribeRes.status}) — tente novamente.`;
        setError(msg);
        setCurrentPtText("");
        setIsProcessing(false);
        return;
      }
      const { text } = await transcribeRes.json();
      setCurrentPtText(text || "");
      if (text && text.trim()) {
        await callInterpret(text.trim());
      }
    } catch (err) {
      console.error('[useInterpreter] transcribe error:', err);
    } finally {
      setCurrentPtText("");
      setIsProcessing(false);
    }
  }, [callInterpret]);

  // ── MODES 2 & 3: continuous SpeechRecognition (real-time feedback) ──────
  const startSpeechCapture = useCallback(() => {
    setError(null);
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError("Reconhecimento de voz não suportado. Use Chrome ou Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "pt-BR";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      if (interimText) setCurrentPtText(interimText);
      if (finalText.trim()) {
        setCurrentPtText("");
        callInterpret(finalText.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.error('[useInterpreter] recognition error:', event.error);
    };

    recognition.onend = () => {
      if (isCapturingRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    isCapturingRef.current = true;
    activeCaptureTypeRef.current = "speech";
    setIsCapturing(true);
  }, [callInterpret]);

  const stopSpeechCapture = useCallback(() => {
    isCapturingRef.current = false;
    activeCaptureTypeRef.current = null;
    setIsCapturing(false);
    setCurrentPtText("");
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  }, []);

  // ── Unified start/stop (dispatches to mode-specific impl) ───────────────
  const startCapture = useCallback(() => {
    if (modeRef.current === "neural") {
      startNeuralCapture();
    } else {
      startSpeechCapture();
    }
  }, [startNeuralCapture, startSpeechCapture]);

  // stopCapture uses activeCaptureTypeRef (what actually started), NOT current mode
  // This prevents leaving mic/recognition running when the user switches mode mid-capture
  const stopCapture = useCallback(() => {
    const activeType = activeCaptureTypeRef.current;
    if (activeType === "neural") {
      stopNeuralCapture();
    } else if (activeType === "speech") {
      stopSpeechCapture();
    }
  }, [stopNeuralCapture, stopSpeechCapture]);

  // ── EN→PT Listening (MediaRecorder → Whisper EN → translate-en-pt) ────────
  // Uses MediaRecorder instead of SpeechRecognition so it can run concurrently
  // with modes 2/3 SpeechRecognition (different browser audio pipelines).
  const processEnChunk = useCallback(async (blob: Blob, mimeType: string) => {
    if (!isListeningENRef.current) return;
    if (blob.size < 1000) return;
    setCurrentEnText("Processando...");
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const transcribeRes = await fetch('/api/ai/whisper-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ audioBase64: base64, mimeType, language: 'en' }),
      });
      if (!transcribeRes.ok) { setCurrentEnText(""); return; }
      const { text } = await transcribeRes.json();
      if (!text?.trim()) { setCurrentEnText(""); return; }

      const translateRes = await fetch('/api/ai/translate-en-pt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ text: text.trim() }),
      });
      setCurrentEnText("");
      if (translateRes.ok) {
        const data = await translateRes.json();
        setLatestEnResult({ enText: text.trim(), ptTranslation: data.translation || "" });
      }
    } catch { setCurrentEnText(""); }
  }, []);

  const startListeningEN = useCallback(async () => {
    if (isListeningENRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          processEnChunk(e.data, mimeType);
        }
      };

      recorder.start(4000); // 4-second chunks
      enMediaRecorderRef.current = recorder;
      enMicStreamRef.current = stream;
      isListeningENRef.current = true;
      setIsListeningEN(true);
    } catch (err) {
      console.error('[useInterpreter] EN listening getUserMedia error:', err);
    }
  }, [processEnChunk]);

  const stopListeningEN = useCallback(() => {
    isListeningENRef.current = false;
    setIsListeningEN(false);
    setCurrentEnText("");
    const recorder = enMediaRecorderRef.current;
    const stream = enMicStreamRef.current;
    enMediaRecorderRef.current = null;
    enMicStreamRef.current = null;
    if (recorder) {
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
    }
    if (stream) stream.getTracks().forEach(t => t.stop());
  }, []);

  // ── stopAll: called when meeting ends or view changes ───────────────────
  const stopAll = useCallback(() => {
    const activeType = activeCaptureTypeRef.current;
    if (isCapturingRef.current) {
      if (activeType === "neural") {
        stopNeuralCapture();
      } else if (activeType === "speech") {
        stopSpeechCapture();
      }
    }
    if (isListeningENRef.current) {
      stopListeningEN();
    }
  }, [stopNeuralCapture, stopSpeechCapture, stopListeningEN]);

  useEffect(() => {
    return () => {
      isCapturingRef.current = false;
      isListeningENRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
      if (mediaRecorderRef.current) {
        try { if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (enMediaRecorderRef.current) {
        try { if (enMediaRecorderRef.current.state !== 'inactive') enMediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (enMicStreamRef.current) {
        enMicStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return {
    mode,
    setMode,
    isCapturing,
    isProcessing,
    currentPtText,
    resultsByMode,
    error,
    startCapture,
    stopCapture,
    stopAll,
    isListeningEN,
    showListeningPanel,
    setShowListeningPanel,
    currentEnText,
    latestEnResult,
    startListeningEN,
    stopListeningEN,
  };
}
