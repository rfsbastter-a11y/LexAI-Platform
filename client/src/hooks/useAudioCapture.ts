import { useState, useRef, useCallback } from 'react';
import { getAuthHeaders } from '@/lib/queryClient';

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { readonly transcript: string; readonly confidence: number };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
  readonly message: string;
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

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const win = window as unknown as Record<string, unknown>;
  return (win.SpeechRecognition || win.webkitSpeechRecognition) as SpeechRecognitionConstructor | null;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
}

interface UseAudioCaptureProps {
  meetingId?: number;
  onTranscript?: (text: string, isFinal: boolean, segments?: TranscriptSegment[]) => void;
  participants?: string[];
  getRecentUtterances?: () => { speaker: string; text: string }[];
  activeSpeakerHint?: string;
  captureMode?: 'tab' | 'ambient';
}

// Each recording window duration in ms.
// After CYCLE_INTERVAL_MS, the current recorder stops (sending its blob) and a new one starts.
const CYCLE_INTERVAL_MS = 15000;

// Short gap between stop and next start to avoid clipping speech at boundaries.
const CYCLE_OVERLAP_MS = 400;

export function useAudioCapture({
  meetingId,
  onTranscript,
  participants,
  getRecentUtterances,
  activeSpeakerHint,
  captureMode = 'tab',
}: UseAudioCaptureProps = {}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isCapturingRef = useRef(false);
  const usingFallbackRef = useRef(false);
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm;codecs=opus');
  const isTranscribingRef = useRef(false);
  const pendingBlobRef = useRef<Blob | null>(null);
  const lastTranscriptRef = useRef('');

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const participantsRef = useRef(participants);
  participantsRef.current = participants;
  const getRecentUtterancesRef = useRef(getRecentUtterances);
  getRecentUtterancesRef.current = getRecentUtterances;
  const activeSpeakerHintRef = useRef(activeSpeakerHint);
  activeSpeakerHintRef.current = activeSpeakerHint;

  const isBrowserSupported = useCallback(() => {
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    const hasMediaDevices = !!navigator.mediaDevices;
    if (!hasMediaRecorder || !hasMediaDevices) return false;
    if (captureMode === 'ambient') {
      return !!navigator.mediaDevices.getUserMedia;
    }
    return !!navigator.mediaDevices.getDisplayMedia;
  }, [captureMode]);

  // ── Transcription ──────────────────────────────────────────────────────

  const sendAudioForTranscription = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size < 1000) {
      console.log(`[AudioCapture] Blob too small (${audioBlob.size} bytes), skipping`);
      return;
    }
    if (isTranscribingRef.current) {
      console.log(`[AudioCapture] Already transcribing, queuing (${audioBlob.size} bytes)`);
      pendingBlobRef.current = audioBlob;
      return;
    }

    isTranscribingRef.current = true;
    try {
      console.log(`[AudioCapture] Sending blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

      if (audioBlob.size > 5 * 1024 * 1024) {
        console.warn(`[AudioCapture] Large payload: ${(audioBlob.size / (1024 * 1024)).toFixed(1)}MB`);
      }

      const arrayBuffer = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const recentUtterances = getRecentUtterancesRef.current?.() || [];
      const hint = activeSpeakerHintRef.current;

      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: audioBlob.type || 'audio/webm',
          participants: participantsRef.current || [],
          recentUtterances,
          ...(hint ? { activeSpeakerHint: hint } : {}),
        }),
      });

      if (!res.ok) {
        console.error(`[AudioCapture] Transcription failed: ${res.status} ${res.statusText}`);
        return;
      }

      const data = await res.json();
      const segments: TranscriptSegment[] = data.segments || [];
      const text: string =
        data.text || segments.map((s: TranscriptSegment) => s.text).join(' ');

      console.log(`[AudioCapture] Got ${segments.length} segment(s), ${text.length} chars`);

      if (text && text.trim()) {
        const trimmedText = text.trim();
        if (trimmedText !== lastTranscriptRef.current) {
          lastTranscriptRef.current = trimmedText;
          setCurrentTranscript(''); // clear interim — text goes to utterances list
          onTranscriptRef.current?.(
            trimmedText,
            true,
            segments.length > 0 ? segments : undefined
          );
        } else {
          console.log(`[AudioCapture] Duplicate transcript, skipping`);
        }
      }
    } catch (err) {
      console.error('[AudioCapture] Error sending audio:', err);
    } finally {
      isTranscribingRef.current = false;
      const pending = pendingBlobRef.current;
      if (pending) {
        pendingBlobRef.current = null;
        sendAudioForTranscription(pending);
      }
    }
  }, []);

  // ── Recording window cycle ─────────────────────────────────────────────
  //
  // KEY FIX: each call to startRecorderWindow() creates a brand-new MediaRecorder.
  // That recorder generates its own EBML header + only the audio from that window.
  // No header prepending, no old audio leaking into the next blob.

  const startRecorderWindow = useCallback(() => {
    if (!isCapturingRef.current || !audioStreamRef.current) return;

    const mimeType = mimeTypeRef.current;
    const recorder = new MediaRecorder(
      audioStreamRef.current,
      mimeType ? { mimeType } : {}
    );
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        console.log(
          `[AudioCapture] Window closed: ${chunks.length} chunks, ${blob.size} bytes`
        );
        sendAudioForTranscription(blob);
      }
    };

    recorder.start(500);
    mediaRecorderRef.current = recorder;
    console.log(`[AudioCapture] New recorder window started`);

    // Schedule the next cycle.
    cycleTimerRef.current = setTimeout(() => {
      if (!isCapturingRef.current) return;

      const current = mediaRecorderRef.current;
      if (current && current.state === 'recording') current.stop();

      // Brief overlap before next window so we don't clip speech at boundaries.
      setTimeout(() => {
        if (isCapturingRef.current) startRecorderWindow();
      }, CYCLE_OVERLAP_MS);
    }, CYCLE_INTERVAL_MS);
  }, [sendAudioForTranscription]);

  const startRealtimeRecognition = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!isCapturingRef.current) return;
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        interimText += event.results[i][0].transcript;
      }
      if (interimText) {
        setCurrentTranscript(interimText);
        onTranscriptRef.current?.(interimText, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
    };

    recognition.onend = () => {
      if (isCapturingRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  // ── Start ──────────────────────────────────────────────────────────────

  const startCapture = useCallback(async () => {
    setError(null);

    if (!isBrowserSupported()) {
      setError(captureMode === 'ambient'
        ? 'Seu navegador não suporta captura de áudio do microfone.'
        : 'Seu navegador não suporta captura de áudio de aba. Use Chrome ou Edge desktop.'
      );
      return;
    }

    try {
      if (captureMode === 'ambient') {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTracks = micStream.getAudioTracks();

        if (audioTracks.length === 0) {
          micStream.getTracks().forEach((t) => t.stop());
          setError('Nenhuma faixa de áudio do microfone foi detectada.');
          return;
        }

        streamRef.current = micStream;
        setVideoStream(null);

        const handleTrackEnded = () => {
          if (isCapturingRef.current) stopCapture();
        };
        micStream.getAudioTracks().forEach((t) => { t.onended = handleTrackEnded; });

        const audioStream = new MediaStream(audioTracks);
        audioStreamRef.current = audioStream;

        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
        }
        mimeTypeRef.current = mimeType;

        lastTranscriptRef.current = '';
        isCapturingRef.current = true;
        setIsCapturing(true);

        startRecorderWindow();
        startRealtimeRecognition();
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();

      if (videoTracks.length > 0) {
        setVideoStream(new MediaStream(videoTracks));
      }

      // ── Fallback: no audio → SpeechRecognition ───────────────────────
      if (audioTracks.length === 0) {
        const SpeechRecognition = getSpeechRecognitionConstructor();
        if (SpeechRecognition) {
          streamRef.current = stream;
          usingFallbackRef.current = true;

          stream.getVideoTracks().forEach((track) => {
            track.onended = () => {
              if (isCapturingRef.current) stopCapture();
            };
          });

          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'pt-BR';
          recognition.maxAlternatives = 1;

          recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interimText = '';
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) finalText += transcript + ' ';
              else interimText += transcript;
            }
            if (finalText.trim()) {
              setCurrentTranscript(finalText.trim());
              onTranscriptRef.current?.(finalText.trim(), true);
            } else if (interimText) {
              setCurrentTranscript(interimText);
              onTranscriptRef.current?.(interimText, false);
            }
          };

          recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            if (event.error === 'network') {
              setTimeout(() => {
                if (isCapturingRef.current && recognitionRef.current) {
                  try { recognitionRef.current.start(); } catch { /* ignore */ }
                }
              }, 1000);
            }
          };

          recognition.onend = () => {
            if (isCapturingRef.current) {
              try { recognition.start(); } catch { /* ignore */ }
            }
          };

          recognitionRef.current = recognition;
          recognition.start();
          isCapturingRef.current = true;
          setIsCapturing(true);
          setError(
            'Áudio da aba não detectado. Usando microfone como fallback. ' +
            'Para capturar áudio da aba, marque "Compartilhar áudio da aba" ao compartilhar.'
          );
          return;
        }

        stream.getTracks().forEach((t) => t.stop());
        setError(
          'Nenhuma faixa de áudio detectada. Ao compartilhar a aba, marque "Compartilhar áudio da aba".'
        );
        return;
      }

      // ── Happy path: MediaRecorder cycling ───────────────────────────
      streamRef.current = stream;

      const handleTrackEnded = () => {
        if (isCapturingRef.current) stopCapture();
      };
      stream.getVideoTracks().forEach((t) => { t.onended = handleTrackEnded; });
      stream.getAudioTracks().forEach((t) => { t.onended = handleTrackEnded; });

      const audioStream = new MediaStream(audioTracks);
      audioStreamRef.current = audioStream;

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
      }
      mimeTypeRef.current = mimeType;

      lastTranscriptRef.current = '';
      isCapturingRef.current = true;
      setIsCapturing(true);

      startRecorderWindow();
      startRealtimeRecognition();
    } catch (err: unknown) {
      const domErr = err as DOMException;
      if (domErr.name === 'NotAllowedError') {
        setError(captureMode === 'ambient'
          ? 'Permissão de microfone negada. Autorize o uso do microfone para continuar.'
          : 'Compartilhamento de tela cancelado. Selecione uma aba e marque "Compartilhar áudio da aba".'
        );
      } else {
        setError(`Erro ao iniciar captura: ${domErr.message}`);
      }
    }
  }, [captureMode, isBrowserSupported, startRecorderWindow, startRealtimeRecognition, stopCapture]);

  // ── Stop ───────────────────────────────────────────────────────────────
  function stopCapture() {
    isCapturingRef.current = false;
    setIsCapturing(false);
    setVideoStream(null);

    if (cycleTimerRef.current) {
      clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    // Stop current window — onstop will flush the last blob automatically.
    if (mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      try {
        if (recorder.state === 'recording') recorder.stop();
      } catch { /* ignore */ }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    audioStreamRef.current = null;
    lastTranscriptRef.current = '';
    usingFallbackRef.current = false;
  }

  return {
    isCapturing,
    error,
    currentTranscript,
    videoStream,
    isBrowserSupported,
    startCapture,
    stopCapture,
  };
}
