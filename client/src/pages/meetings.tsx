import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import { getAuthHeaders } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Video, Mic, MicOff, Play, Square, Plus, X, Send, Sparkles, Clock,
  Users, Monitor, AlertTriangle, History, FileText, ChevronRight,
  Trash2, Search, MessageSquare, Loader2, CheckCircle, Target, ArrowLeft,
  UserPlus, Brain, Maximize2, Minimize2, PictureInPicture2, Move,
  Globe, Headphones, Volume2, RotateCcw
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAudioCapture, type TranscriptSegment } from "@/hooks/useAudioCapture";
import { useInterpreter } from "@/hooks/useInterpreter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Meeting {
  id: number;
  title: string;
  platform: string;
  legalRole: string;
  status: string;
  clientId: number | null;
  caseId: number | null;
  summary: string | null;
  decisions: string[] | null;
  actions: { description: string; responsible: string; deadline: string }[] | null;
  risks: string[] | null;
  nextSteps: string[] | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  participants?: { id: number; name: string; role: string | null }[];
  utterances?: { id: number; speakerName: string | null; text: string; timestampMs: number | null; createdAt: string }[];
  insights?: { id: number; type: string; content: string; createdAt: string }[];
  chatMessages?: { id: number; role: string; content: string; createdAt: string }[];
  discProfiles?: { name: string; profile: string; description: string; tip: string }[];
}

type ViewMode = "list" | "setup" | "active" | "summary" | "detail";
type FullscreenPanel = null | "transcript" | "insights" | "chat" | "interpreter";

const PLATFORMS = [
  { value: "google_meet", label: "Google Meet" },
  { value: "zoom", label: "Zoom" },
  { value: "teams", label: "Microsoft Teams" },
];

const LEGAL_ROLES = [
  { value: "consultoria", label: "Consultoria Jurídica" },
  { value: "contencioso", label: "Contencioso" },
  { value: "teses", label: "Teses Jurídicas" },
  { value: "negociacao", label: "Negociação" },
  { value: "compliance", label: "Compliance" },
];

const DISC_COLORS: Record<string, string> = {
  D: "bg-red-500/20 text-red-400 border-red-500/30",
  I: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  S: "bg-green-500/20 text-green-400 border-green-500/30",
  C: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};


function getDiscLetter(profile: string): string {
  const first = profile.trim().charAt(0).toUpperCase();
  return ["D", "I", "S", "C"].includes(first) ? first : "D";
}

export default function MeetingsPage() {
  const [view, setView] = useState<ViewMode>("list");
  const [activeMeetingId, setActiveMeetingId] = useState<number | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [setupTitle, setSetupTitle] = useState("");
  const [setupPlatform, setSetupPlatform] = useState("google_meet");
  const [setupLegalRole, setSetupLegalRole] = useState("consultoria");
  const [setupParticipants, setSetupParticipants] = useState<string[]>([""]);
  const [setupClientId, setSetupClientId] = useState<string>("");
  const [setupCaseId, setSetupCaseId] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);

  const [localUtterances, setLocalUtterances] = useState<{ speakerName: string; discSpeaker?: string; text: string; time: string; rawSpeaker?: string }[]>([]);
  const [latestInsight, setLatestInsight] = useState("");
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [activeSpeakerHint, setActiveSpeakerHint] = useState<string | null>(null);
  const [activePanels, setActivePanels] = useState<Set<string>>(new Set(["transcript"]));
  const [newParticipantName, setNewParticipantName] = useState("");
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [liveParticipants, setLiveParticipants] = useState<{ id: number; name: string; role: string | null }[]>([]);
  const [fullscreenPanel, setFullscreenPanel] = useState<FullscreenPanel>(null);
  const [showPip, setShowPip] = useState(true);
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const [pipSize, setPipSize] = useState({ w: 480, h: 270 });
  const pipDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const pipResizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const isGeneratingRef = useRef(false);
  const activeSpeakerHintRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const localUtterancesRef = useRef(localUtterances);
  localUtterancesRef.current = localUtterances;

  activeSpeakerHintRef.current = activeSpeakerHint;

  const getRecentUtterances = useCallback(() => {
    return localUtterancesRef.current.slice(-8).map(u => ({
      speaker: u.discSpeaker || u.rawSpeaker || u.speakerName,
      text: u.text,
    }));
  }, []);

  const handleTranscript = useCallback(async (text: string, isFinal: boolean, segments?: TranscriptSegment[]) => {
    if (!isFinal || !activeMeetingId) return;

    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    // Manual hint is DISC-only metadata — never used as a visible transcript label
    const discSpeaker = activeSpeakerHintRef.current || undefined;
    if (segments && segments.length > 0) {
      const newUtterances = segments.map(seg => ({
        rawSpeaker: seg.speaker,
        speakerName: "Participante",
        discSpeaker,
        text: seg.text,
        time,
      }));

      // Pure state update — no side effects inside the setter
      const updatedUtterances = [...localUtterancesRef.current, ...newUtterances];
      setLocalUtterances(updatedUtterances);

      // Auto-trigger Conselheiro outside the setter (side effect safe zone)
      if (!isGeneratingRef.current) {
        isGeneratingRef.current = true;
        const recentUtterances = updatedUtterances.slice(-20).map(u => ({
          speaker: u.discSpeaker || "Participante",
          text: u.text,
        }));
        fetch(`/api/meetings/${activeMeetingId}/insights`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ recentUtterances }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.content) setLatestInsight(data.content);
            isGeneratingRef.current = false;
          })
          .catch(() => { isGeneratingRef.current = false; });
      }

      for (const seg of segments) {
        try {
          // Store neutrally in DB — DISC attribution stays in frontend local state
          await fetch(`/api/meetings/${activeMeetingId}/transcript`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            credentials: "include",
            body: JSON.stringify({ text: seg.text, speakerName: "Participante", timestampMs: Date.now() }),
          });
        } catch (err) {
          console.error("Error sending transcript segment:", err);
        }
      }
    } else {
      // Pure state update — no side effects inside the setter
      const updatedUtterances = [...localUtterancesRef.current, { speakerName: "Participante", discSpeaker, text, time }];
      setLocalUtterances(updatedUtterances);

      // Auto-trigger Conselheiro outside the setter
      if (!isGeneratingRef.current) {
        isGeneratingRef.current = true;
        const recentUtterances = updatedUtterances.slice(-20).map(u => ({
          speaker: u.discSpeaker || "Participante",
          text: u.text,
        }));
        fetch(`/api/meetings/${activeMeetingId}/insights`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ recentUtterances }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.content) setLatestInsight(data.content);
            isGeneratingRef.current = false;
          })
          .catch(() => { isGeneratingRef.current = false; });
      }

      try {
        await fetch(`/api/meetings/${activeMeetingId}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ text, speakerName: "Participante", timestampMs: Date.now() }),
        });
      } catch (err) {
        console.error("Error sending transcript:", err);
      }
    }
  }, [activeMeetingId]);

  const liveParticipantNames = liveParticipants.map(p => p.name);

  const { isCapturing, error: captureError, currentTranscript, videoStream, isBrowserSupported, startCapture, stopCapture } = useAudioCapture({
    meetingId: activeMeetingId || undefined,
    onTranscript: handleTranscript,
    participants: liveParticipantNames,
    getRecentUtterances,
    activeSpeakerHint: activeSpeakerHint ?? undefined,
  });

  const {
    mode: interpreterMode,
    setMode: interpreterSetMode,
    isCapturing: interpreterIsCapturing,
    isProcessing: interpreterIsProcessing,
    currentPtText: interpreterCurrentPtText,
    resultsByMode: interpreterResultsByMode,
    error: interpreterError,
    startCapture: interpreterStartCapture,
    stopCapture: interpreterStopCapture,
    stopAll: interpreterStopAll,
    isListeningEN: interpreterIsListeningEN,
    showListeningPanel: interpreterShowListeningPanel,
    setShowListeningPanel: interpreterSetShowListeningPanel,
    currentEnText: interpreterCurrentEnText,
    latestEnResult: interpreterLatestEnResult,
    startListeningEN: interpreterStartListeningEN,
    stopListeningEN: interpreterStopListeningEN,
  } = useInterpreter({ meetingType: activeMeeting?.legalRole || undefined });

  // Convenience: current mode's result (per-mode state; preserved when switching modes)
  const interpreterLatestResult = interpreterMode ? interpreterResultsByMode[interpreterMode] : null;

  useEffect(() => {
    if (showPip && pipVideoRef.current && videoStream) {
      pipVideoRef.current.srcObject = videoStream;
    }
  }, [videoStream, showPip]);

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (pipDragRef.current) {
        const dx = e.clientX - pipDragRef.current.startX;
        const dy = e.clientY - pipDragRef.current.startY;
        setPipPos({
          x: Math.max(0, Math.min(window.innerWidth - pipSize.w, pipDragRef.current.origX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - pipSize.h, pipDragRef.current.origY + dy)),
        });
      }
      if (pipResizeRef.current) {
        const dx = e.clientX - pipResizeRef.current.startX;
        const newW = Math.max(200, Math.min(800, pipResizeRef.current.origW + dx));
        const newH = Math.round(newW * 9 / 16);
        setPipSize({ w: newW, h: newH });
        setPipPos(prev => prev ? {
          x: Math.max(0, Math.min(window.innerWidth - newW, prev.x)),
          y: Math.max(0, Math.min(window.innerHeight - newH, prev.y)),
        } : prev);
      }
    };
    const handleMouseUp = () => {
      if (pipDragRef.current) {
        pipDragRef.current = null;
        document.body.style.userSelect = "";
      }
      if (pipResizeRef.current) {
        pipResizeRef.current = null;
        document.body.style.userSelect = "";
      }
    };
    const handleWindowResize = () => {
      setPipPos(prev => prev ? {
        x: Math.max(0, Math.min(window.innerWidth - pipSize.w, prev.x)),
        y: Math.max(0, Math.min(window.innerHeight - pipSize.h, prev.y)),
      } : prev);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [pipSize.w, pipSize.h]);

  const handlePipDragStart = (e: ReactMouseEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    pipDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    };
    if (!pipPos) {
      setPipPos({ x: rect.left, y: rect.top });
    }
    document.body.style.userSelect = "none";
  };

  const handlePipResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pipResizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: pipSize.w,
      origH: pipSize.h,
    };
    document.body.style.userSelect = "none";
  };

  const { data: meetingsList = [], isLoading: meetingsLoading } = useQuery<Meeting[]>({
    queryKey: ["/api/meetings"],
    staleTime: 30000,
  });

  const { data: clients = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/clients"],
    staleTime: 60000,
  });

  const { data: casesList = [] } = useQuery<{ id: number; title: string; caseNumber: string }[]>({
    queryKey: ["/api/cases"],
    staleTime: 60000,
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localUtterances]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (activeMeeting?.participants) {
      setLiveParticipants(activeMeeting.participants);
    }
  }, [activeMeeting?.participants]);

  const browserSupported = isBrowserSupported();

  const addParticipantDuringMeeting = async () => {
    if (!newParticipantName.trim() || !activeMeetingId) return;
    setIsAddingParticipant(true);
    try {
      const res = await fetch(`/api/meetings/${activeMeetingId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ name: newParticipantName.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      const participant = await res.json();
      setLiveParticipants(prev => [...prev, participant]);
      setNewParticipantName("");
      toast({ title: "Participante adicionado", description: participant.name });
    } catch {
      toast({ title: "Erro", description: "Falha ao adicionar participante", variant: "destructive" });
    } finally {
      setIsAddingParticipant(false);
    }
  };

  const createMeeting = async () => {
    if (!setupTitle.trim()) {
      toast({ title: "Erro", description: "Informe o título da reunião", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          title: setupTitle.trim(),
          platform: setupPlatform,
          legalRole: setupLegalRole,
          clientId: setupClientId && setupClientId !== "none" ? parseInt(setupClientId) : null,
          caseId: setupCaseId && setupCaseId !== "none" ? parseInt(setupCaseId) : null,
          participants: setupParticipants.filter(p => p.trim()),
        }),
      });
      if (!res.ok) throw new Error("Failed to create meeting");
      const meeting = await res.json();
      setActiveMeetingId(meeting.id);
      setActiveMeeting(meeting);
      setView("active");
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });

      const detailRes = await fetch(`/api/meetings/${meeting.id}`, {
        headers: { ...getAuthHeaders() },
        credentials: "include",
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        setActiveMeeting(detail);
        setLiveParticipants(detail.participants || []);
      }

      await fetch(`/api/meetings/${meeting.id}/start`, {
        method: "PUT",
        headers: { ...getAuthHeaders() },
        credentials: "include",
      });
    } catch {
      toast({ title: "Erro", description: "Falha ao criar reunião", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const endMeeting = async () => {
    if (!activeMeetingId) return;
    setIsEndingMeeting(true);
    try {
      if (isCapturing) stopCapture();
      interpreterStopAll();
      const res = await fetch(`/api/meetings/${activeMeetingId}/end`, {
        method: "PUT",
        headers: { ...getAuthHeaders() },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to end meeting");
      const data = await res.json();
      setActiveMeeting(data);
      setView("summary");
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
    } catch {
      toast({ title: "Erro", description: "Falha ao encerrar reunião", variant: "destructive" });
    } finally {
      setIsEndingMeeting(false);
    }
  };

  const resumeMeeting = async (meetingId: number) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/resume`, {
        method: "PUT",
        headers: { ...getAuthHeaders() },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to resume meeting");
      const data = await res.json();
      setActiveMeetingId(data.id);
      setActiveMeeting(data);
      setLiveParticipants(data.participants || []);
      setLocalUtterances(
        (data.utterances || []).map((u: { speakerName?: string; text: string; createdAt?: string }) => ({
          speakerName: u.speakerName || "Participante",
          text: u.text,
          time: u.createdAt ? new Date(u.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
        }))
      );
      setChatMessages(
        (data.chatMessages || []).map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        }))
      );
      if (data.insights && data.insights.length > 0) {
        setLatestInsight(data.insights[data.insights.length - 1].content);
      }
      setView("active");
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast({ title: "Reunião retomada", description: "Você retornou à reunião. Inicie a captura de áudio quando estiver pronto." });
    } catch {
      toast({ title: "Erro", description: "Falha ao retomar reunião", variant: "destructive" });
    }
  };

  const generateInsights = async () => {
    if (!activeMeetingId) return;
    setIsGeneratingInsight(true);
    isGeneratingRef.current = true;
    try {
      const recentUtterances = localUtterancesRef.current.slice(-20).map(u => ({
        speaker: u.discSpeaker || "Participante",
        text: u.text,
      }));
      const res = await fetch(`/api/meetings/${activeMeetingId}/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ recentUtterances }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setLatestInsight(data.content);
    } catch {
      toast({ title: "Erro", description: "Falha ao gerar insights", variant: "destructive" });
    } finally {
      setIsGeneratingInsight(false);
      isGeneratingRef.current = false;
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !activeMeetingId) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsSendingChat(true);
    try {
      const res = await fetch(`/api/meetings/${activeMeetingId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ message: userMsg }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "assistant", content: data.content }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Erro ao processar. Tente novamente." }]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const viewMeetingDetail = async (meetingId: number) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        headers: { ...getAuthHeaders() },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setActiveMeeting(data);
      setView("detail");
    } catch {
      toast({ title: "Erro", description: "Falha ao carregar reunião", variant: "destructive" });
    }
  };

  const deleteMeeting = async (meetingId: number) => {
    try {
      await fetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
        credentials: "include",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast({ title: "Reunião excluída" });
    } catch {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    }
  };

  const resetSetup = () => {
    interpreterStopAll();
    setSetupTitle("");
    setSetupPlatform("google_meet");
    setSetupLegalRole("consultoria");
    setSetupParticipants([""]);
    setSetupClientId("");
    setSetupCaseId("");
    setLocalUtterances([]);
    setLatestInsight("");
    setChatMessages([]);
    setChatInput("");
    setActiveMeetingId(null);
    setActiveMeeting(null);
    setLiveParticipants([]);
    setNewParticipantName("");
    setFullscreenPanel(null);
    setShowPip(true);
  };

  const filteredMeetings = meetingsList.filter(m =>
    m.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const platformLabel = (val: string) => PLATFORMS.find(p => p.value === val)?.label || val;
  const roleLabel = (val: string) => LEGAL_ROLES.find(r => r.value === val)?.label || val;

  const toggleFullscreen = (panel: "transcript" | "insights" | "chat" | "interpreter") => {
    setFullscreenPanel(prev => prev === panel ? null : panel);
  };

  const FullscreenBtn = ({ panel }: { panel: "transcript" | "insights" | "chat" | "interpreter" }) => (
    <button
      onClick={() => toggleFullscreen(panel)}
      className="ml-auto p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      title={fullscreenPanel === panel ? "Minimizar" : "Tela cheia"}
      data-testid={`button-fullscreen-${panel}`}
    >
      {fullscreenPanel === panel ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );

  const visiblePanels = fullscreenPanel
    ? new Set([fullscreenPanel])
    : activePanels;

  const gridCols = fullscreenPanel
    ? "1fr"
    : `repeat(${Math.min(visiblePanels.size, 3)}, 1fr)${visiblePanels.size < 3 ? ' auto' : ''}`;

  const renderSetup = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => { setView("list"); resetSetup(); }} data-testid="button-back-list">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h2 className="text-xl font-bold text-foreground">Nova Reunião</h2>
      </div>

      {!browserSupported && (
        <Card className="bg-yellow-900/30 border-yellow-600/50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-yellow-200 font-medium">Navegador incompatível</p>
              <p className="text-yellow-300/70 text-sm">
                A transcrição ao vivo requer Chrome ou Edge desktop. Você pode criar a reunião, mas a captura de áudio não funcionará neste navegador.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <Label className="text-muted-foreground">Título da Reunião *</Label>
            <Input value={setupTitle} onChange={e => setSetupTitle(e.target.value)} placeholder="Ex: Reunião com cliente sobre ação trabalhista" className="mt-1" data-testid="input-meeting-title" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Plataforma</Label>
              <Select value={setupPlatform} onValueChange={setSetupPlatform}>
                <SelectTrigger className="mt-1" data-testid="select-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground">Papel Jurídico</Label>
              <Select value={setupLegalRole} onValueChange={setSetupLegalRole}>
                <SelectTrigger className="mt-1" data-testid="select-legal-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEGAL_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground">Participantes</Label>
            {setupParticipants.map((p, i) => (
              <div key={i} className="flex gap-2 mt-1">
                <Input value={p} onChange={e => { const arr = [...setupParticipants]; arr[i] = e.target.value; setSetupParticipants(arr); }} placeholder={`Participante ${i + 1}`} data-testid={`input-participant-${i}`} />
                {setupParticipants.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => setSetupParticipants(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setSetupParticipants(prev => [...prev, ""])} className="text-primary mt-2" data-testid="button-add-participant">
              <Plus className="h-4 w-4 mr-1" /> Adicionar participante
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Vincular a Cliente (opcional)</Label>
              <Select value={setupClientId} onValueChange={setSetupClientId}>
                <SelectTrigger className="mt-1" data-testid="select-client">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground">Vincular a Processo (opcional)</Label>
              <Select value={setupCaseId} onValueChange={setSetupCaseId}>
                <SelectTrigger className="mt-1" data-testid="select-case">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {casesList.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.caseNumber} - {c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={createMeeting} disabled={isCreating || !setupTitle.trim()} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold mt-4" data-testid="button-start-meeting">
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Iniciar Reunião
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderActive = () => (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isCapturing ? "bg-red-500 animate-pulse" : "bg-gray-500"}`} />
          <h2 className="text-lg font-bold text-foreground" data-testid="text-meeting-title">{activeMeeting?.title}</h2>
          <Badge variant="outline" className="text-primary border-primary/30">
            {platformLabel(activeMeeting?.platform || "")}
          </Badge>
          <Badge variant="outline" className="text-blue-400 border-blue-400/30">
            {roleLabel(activeMeeting?.legalRole || "")}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {!isCapturing ? (
            <Button onClick={startCapture} disabled={!browserSupported} className="bg-green-600 hover:bg-green-700 text-primary-foreground" data-testid="button-start-capture">
              <Monitor className="h-4 w-4 mr-2" /> Capturar Áudio da Aba
            </Button>
          ) : (
            <Button onClick={stopCapture} variant="destructive" data-testid="button-stop-capture">
              <MicOff className="h-4 w-4 mr-2" /> Parar Captura
            </Button>
          )}
          <Button onClick={endMeeting} disabled={isEndingMeeting} variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" data-testid="button-end-meeting">
            {isEndingMeeting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Square className="h-4 w-4 mr-2" />}
            Encerrar
          </Button>
        </div>
      </div>

      {captureError && (
        <Card className="bg-red-900/20 border-red-600/30">
          <CardContent className="p-3 text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {captureError}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-4 mb-2 flex-wrap">
        {liveParticipants.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-slate-400 text-sm whitespace-nowrap">Falando agora:</Label>
            <button
              onClick={() => setActiveSpeakerHint(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!activeSpeakerHint ? "bg-slate-600 text-white border-slate-500" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500"}`}
              data-testid="button-speaker-none"
            >
              Ninguém
            </button>
            {liveParticipants.map(p => (
              <button
                key={p.id}
                onClick={() => setActiveSpeakerHint(prev => prev === p.name ? null : p.name)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${activeSpeakerHint === p.name ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-slate-400 border-slate-700 hover:border-primary/50 hover:text-slate-200"}`}
                data-testid={`button-speaker-hint-${p.id}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={newParticipantName}
            onChange={e => setNewParticipantName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addParticipantDuringMeeting()}
            placeholder="Novo participante..."
            className="w-40 h-8 text-sm"
            data-testid="input-new-participant"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={addParticipantDuringMeeting}
            disabled={!newParticipantName.trim() || isAddingParticipant}
            className="h-8 text-xs"
            data-testid="button-add-participant-live"
          >
            {isAddingParticipant ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3 mr-1" />}
            Adicionar
          </Button>
        </div>
        {videoStream && (
          <button
            onClick={() => setShowPip(prev => !prev)}
            className={`ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${showPip ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
            data-testid="button-toggle-pip"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
            PIP
          </button>
        )}
      </div>

      {!fullscreenPanel && (
        <div className="flex gap-2 mb-2 flex-wrap">
          <button onClick={() => setActivePanels(prev => { const next = new Set(prev); if (next.has("transcript")) { if (next.size > 1) next.delete("transcript"); } else { next.add("transcript"); } return next; })} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activePanels.has("transcript") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`} data-testid="tab-transcript">
            <FileText className="h-4 w-4 inline mr-1" /> Transcrição
          </button>
          <button onClick={() => setActivePanels(prev => { const next = new Set(prev); if (next.has("insights")) { if (next.size > 1) next.delete("insights"); } else { next.add("insights"); } return next; })} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activePanels.has("insights") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`} data-testid="tab-insights">
            <Sparkles className="h-4 w-4 inline mr-1" /> Conselheiro
          </button>
          <button onClick={() => setActivePanels(prev => { const next = new Set(prev); if (next.has("chat")) { if (next.size > 1) next.delete("chat"); } else { next.add("chat"); } return next; })} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activePanels.has("chat") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`} data-testid="tab-chat">
            <MessageSquare className="h-4 w-4 inline mr-1" /> Chat
          </button>
          <button onClick={() => setActivePanels(prev => { const next = new Set(prev); if (next.has("interpreter")) { if (next.size > 1) next.delete("interpreter"); } else { next.add("interpreter"); } return next; })} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activePanels.has("interpreter") ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`} data-testid="tab-interpreter">
            <Globe className="h-4 w-4 inline mr-1" /> Intérprete
          </button>
        </div>
      )}

      <div className="grid gap-4" style={{ height: fullscreenPanel ? "calc(100vh - 250px)" : "calc(100vh - 360px)", gridTemplateColumns: gridCols }}>
        {visiblePanels.has("transcript") && (
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="py-2 px-4 border-b border-border flex-shrink-0">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" /> Transcrição
                <FullscreenBtn panel="transcript" />
              </CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1 p-4">
              {localUtterances.length === 0 && !currentTranscript ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Mic className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">
                    {isCapturing ? "Ouvindo... fale para ver a transcrição em tempo real." : "Clique em 'Capturar Áudio da Aba' para iniciar."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {localUtterances.map((u, i) => (
                    <div key={i} className="flex gap-3 rounded-lg px-2 py-1 border border-border/40" data-testid={`utterance-${i}`}>
                      <span className="text-xs text-slate-500 mt-1 w-12 flex-shrink-0">{u.time}</span>
                      <p className="flex-1 text-muted-foreground text-sm leading-snug">{u.text}</p>
                    </div>
                  ))}
                  {currentTranscript && isCapturing && (
                    <div className="flex gap-3 rounded-lg px-2 py-1.5 border border-dashed border-amber-500/30 bg-amber-500/5" data-testid="provisional-transcript">
                      <span className="text-xs text-amber-500/60 mt-1 w-12 flex-shrink-0">ao vivo</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-amber-400/70 text-xs font-semibold">🎙 Mic</span>
                        <p className="text-amber-200/70 text-sm italic leading-snug">{currentTranscript}</p>
                      </div>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </ScrollArea>
          </Card>
        )}

        {visiblePanels.has("insights") && (
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="py-2 px-4 border-b border-border flex-shrink-0">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Conselheiro ao vivo
                <FullscreenBtn panel="insights" />
              </CardTitle>
            </CardHeader>
            <div className="p-4 flex-1 flex flex-col overflow-hidden">
              <Button onClick={generateInsights} disabled={isGeneratingInsight || localUtterances.length === 0} className="bg-primary hover:bg-primary/90 text-primary-foreground mb-4 flex-shrink-0" data-testid="button-generate-insights">
                {isGeneratingInsight ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Atualizar Conselheiro
              </Button>
              <ScrollArea className="flex-1">
                {latestInsight ? (
                  <div className="prose prose-invert prose-sm max-w-none text-muted-foreground" data-testid="text-insights">
                    <ReactMarkdown>{latestInsight}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm text-center mt-8">
                    <Brain className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>O conselheiro atualiza a cada bloco de áudio processado.</p>
                    <p className="mt-1 text-xs opacity-70">Marque quem está falando para personalizar as dicas por perfil.</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </Card>
        )}

        {visiblePanels.has("chat") && (
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="py-2 px-4 border-b border-border flex-shrink-0">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Chat
                <FullscreenBtn panel="chat" />
              </CardTitle>
            </CardHeader>
            <div className="p-4 flex-1 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1 mb-3">
                {chatMessages.length === 0 ? (
                  <div className="text-slate-500 text-sm text-center mt-8">
                    Faça perguntas à IA sobre o contexto da reunião.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {chatMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`chat-msg-${i}`}>
                        <div className={`max-w-[85%] rounded-lg p-3 text-sm ${m.role === "user" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {m.role === "user" ? (
                            <div className="whitespace-pre-wrap">{m.content}</div>
                          ) : (
                            <div className="prose prose-invert prose-sm max-w-none">
                              <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isSendingChat && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg p-3">
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </ScrollArea>
              <div className="flex gap-2 flex-shrink-0">
                <Input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()} placeholder="Pergunte algo sobre a reunião..." data-testid="input-chat-message" />
                <Button onClick={sendChatMessage} disabled={!chatInput.trim() || isSendingChat} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="button-send-chat">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {visiblePanels.has("interpreter") && (
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="py-2 px-4 border-b border-border flex-shrink-0">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-400" /> Intérprete PT→EN
                <FullscreenBtn panel="interpreter" />
              </CardTitle>
            </CardHeader>
            <div className="flex flex-col flex-1 overflow-hidden p-3 gap-3">

              {/* Mode selector */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => interpreterSetMode("neural")}
                  className={`p-2 rounded-lg border text-left transition-colors ${interpreterMode === "neural" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                  data-testid="interpreter-mode-neural"
                >
                  <Volume2 className="h-3.5 w-3.5 mb-1" />
                  <div className="text-xs font-medium">Voz Neural</div>
                  <div className="text-[10px] opacity-60 mt-0.5">IA fala por você</div>
                </button>
                <button
                  onClick={() => interpreterSetMode("phonetic")}
                  className={`p-2 rounded-lg border text-left transition-colors ${interpreterMode === "phonetic" ? "border-yellow-500 bg-yellow-500/10 text-yellow-400" : "border-border text-muted-foreground hover:border-yellow-500/50"}`}
                  data-testid="interpreter-mode-phonetic"
                >
                  <Mic className="h-3.5 w-3.5 mb-1" />
                  <div className="text-xs font-medium">Fonética</div>
                  <div className="text-[10px] opacity-60 mt-0.5">Leia em voz alta</div>
                </button>
                <button
                  onClick={() => interpreterSetMode("teleprompter")}
                  className={`p-2 rounded-lg border text-left transition-colors ${interpreterMode === "teleprompter" ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground hover:border-emerald-500/50"}`}
                  data-testid="interpreter-mode-teleprompter"
                >
                  <FileText className="h-3.5 w-3.5 mb-1" />
                  <div className="text-xs font-medium">Teleprompter</div>
                  <div className="text-[10px] opacity-60 mt-0.5">Frases EN prontas</div>
                </button>
              </div>

              {/* EN→PT Listening — collapsible panel */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
                <button
                  onClick={() => {
                    const next = !interpreterShowListeningPanel;
                    interpreterSetShowListeningPanel(next);
                    if (!next && interpreterIsListeningEN) interpreterStopListeningEN();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-left"
                  data-testid="toggle-listening-en-panel"
                >
                  <div className="flex items-center gap-2 text-blue-400">
                    <Headphones className="h-3.5 w-3.5" />
                    <span className="font-medium">Escuta EN→PT</span>
                    {interpreterIsListeningEN && <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />}
                  </div>
                  <span className="text-muted-foreground">{interpreterShowListeningPanel ? "▴" : "▾"}</span>
                </button>
                {interpreterShowListeningPanel && (
                  <div className="px-3 pb-3 space-y-2 border-t border-blue-500/20">
                    <p className="text-[10px] text-muted-foreground pt-2">
                      Ouça o microfone em inglês e traduza para PT em tempo real.<br />
                      <em>Dica: use caixas de som (não fone) para capturar o áudio do participante.</em>
                    </p>
                    <button
                      onClick={() => interpreterIsListeningEN ? interpreterStopListeningEN() : interpreterStartListeningEN()}
                      className={`w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md border transition-colors ${interpreterIsListeningEN ? "bg-blue-500/20 border-blue-500/40 text-blue-300" : "bg-muted/30 border-muted text-muted-foreground hover:text-foreground"}`}
                      data-testid="toggle-listening-en"
                    >
                      <Headphones className="h-3 w-3" />
                      {interpreterIsListeningEN ? "Parar escuta" : "Iniciar escuta"}
                    </button>
                    {interpreterCurrentEnText && (
                      <div className="rounded bg-blue-500/5 border border-blue-500/10 p-2">
                        <div className="text-xs text-slate-500 italic">{interpreterCurrentEnText}...</div>
                      </div>
                    )}
                    {interpreterLatestEnResult && (
                      <div className="rounded bg-blue-500/10 border border-blue-500/20 p-2.5">
                        <div className="text-[10px] text-blue-400 mb-1 font-medium uppercase tracking-wide">🎧 Participante disse</div>
                        <div className="text-[10px] text-slate-400 mb-1 italic">{interpreterLatestEnResult.enText}</div>
                        <div className="text-sm text-blue-200 font-medium leading-snug">{interpreterLatestEnResult.ptTranslation}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Results area */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-3 pr-1">
                  {!interpreterMode && (
                    <div className="text-center text-slate-500 text-xs mt-6">
                      <Globe className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p>Selecione um modo acima</p>
                      <p className="text-[10px] mt-1 opacity-70">ou abra a escuta EN→PT</p>
                    </div>
                  )}

                  {/* PT interim (what user is saying) */}
                  {interpreterCurrentPtText && (
                    <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-2.5">
                      <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Você está dizendo...</div>
                      <div className="text-sm text-slate-300 italic">{interpreterCurrentPtText}</div>
                    </div>
                  )}

                  {/* Processing */}
                  {interpreterIsProcessing && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Traduzindo...
                    </div>
                  )}

                  {/* Result — Neural mode */}
                  {interpreterLatestResult && interpreterMode === "neural" && (
                    <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 space-y-1.5">
                      <div className="text-[10px] text-primary font-medium uppercase tracking-wide flex items-center gap-1">
                        <Volume2 className="h-3 w-3" /> IA falou em inglês
                      </div>
                      <div className="text-sm text-foreground font-medium leading-snug">{interpreterLatestResult.translationLiteral}</div>
                      <div className="text-[10px] text-slate-500 italic border-t border-slate-700/50 pt-1.5">PT: {interpreterLatestResult.ptText}</div>
                    </div>
                  )}

                  {/* Result — Phonetic mode */}
                  {interpreterLatestResult && interpreterMode === "phonetic" && (
                    <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 space-y-2">
                      <div className="text-[10px] text-yellow-400 font-medium uppercase tracking-wide">🗣 Leia em voz alta</div>
                      <div className="text-xs text-slate-400">{interpreterLatestResult.translationLiteral}</div>
                      <div className="text-lg font-bold text-yellow-200 leading-relaxed tracking-wide">{interpreterLatestResult.phonetic}</div>
                      <div className="text-[10px] text-slate-500 italic border-t border-slate-700/50 pt-1.5">PT: {interpreterLatestResult.ptText}</div>
                    </div>
                  )}

                  {/* Result — Teleprompter mode */}
                  {interpreterLatestResult && interpreterMode === "teleprompter" && (
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-2">
                      <div className="text-[10px] text-emerald-400 font-medium uppercase tracking-wide">📺 Diga em inglês</div>
                      <div className="text-base font-bold text-foreground leading-relaxed">{interpreterLatestResult.translationPolished}</div>
                      <div className="text-xs text-slate-400 border-t border-slate-700/50 pt-1.5">{interpreterLatestResult.translationLiteral}</div>
                      <div className="text-[11px] text-emerald-300/70 italic flex items-start gap-1">
                        <span className="opacity-60">↩</span> {interpreterLatestResult.ptBack}
                      </div>
                    </div>
                  )}

                  {/* Neural mode — virtual cable instructions */}
                  {interpreterMode === "neural" && !interpreterIsCapturing && !interpreterLatestResult && (
                    <div className="text-xs text-slate-500 space-y-1.5 bg-slate-800/30 rounded-lg p-3">
                      <p className="font-medium text-slate-400 text-[11px]">Para a IA falar no seu meeting, instale um cabo de áudio virtual:</p>
                      <p>• <strong className="text-slate-300">Windows:</strong>{" "}
                        <a href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer" className="text-primary underline">VB-Cable</a>
                        <span className="text-slate-600"> (gratuito) — instale como administrador e reinicie o PC</span>
                      </p>
                      <p>• <strong className="text-slate-300">Mac:</strong>{" "}
                        <a href="https://existential.audio/blackhole/" target="_blank" rel="noopener noreferrer" className="text-primary underline">BlackHole</a>
                        <span className="text-slate-600"> (gratuito)</span>
                      </p>
                      <p className="text-[10px] text-slate-600 mt-1">Depois: no meeting selecione o cabo virtual como microfone e no navegador como saída de áudio.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Capture button */}
              {interpreterMode && (
                <div className="flex-shrink-0 space-y-1">
                  {interpreterIsCapturing ? (
                    <Button
                      onClick={interpreterStopCapture}
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      data-testid="button-interpreter-stop"
                    >
                      <MicOff className="h-4 w-4 mr-2" /> Parar
                    </Button>
                  ) : (
                    <Button
                      onClick={interpreterStartCapture}
                      size="sm"
                      className={`w-full ${interpreterMode === "neural" ? "bg-primary hover:bg-primary/90" : interpreterMode === "phonetic" ? "bg-yellow-600 hover:bg-yellow-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
                      data-testid="button-interpreter-start"
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      {interpreterMode === "neural" ? "Falar — IA traduz" : interpreterMode === "phonetic" ? "Falar — ver fonética" : "Falar — teleprompter"}
                    </Button>
                  )}
                  {interpreterIsCapturing && (
                    <p className="text-[10px] text-center text-slate-500">
                      {interpreterMode === "neural" ? "🔴 Traduzindo ao vivo — IA falará em inglês" : interpreterMode === "phonetic" ? "🟡 Ouça, depois leia a fonética" : "🟢 Leia a versão polida em inglês"}
                    </p>
                  )}
                  {interpreterError && <p className="text-xs text-red-400 text-center">{interpreterError}</p>}
                </div>
              )}
            </div>
          </Card>
        )}

        {!fullscreenPanel && visiblePanels.size < 3 && (
        <div className="space-y-4 w-48 flex-shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> Participantes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {liveParticipants.length > 0 ? liveParticipants.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-foreground" data-testid={`text-participant-${i}`}>
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  {p.name}
                </div>
              )) : <p className="text-sm text-muted-foreground">Nenhum participante</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" /> Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Captura</span>
                <Badge className={isCapturing ? "bg-green-600" : "bg-gray-600"}>{isCapturing ? "Ativa" : "Inativa"}</Badge>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Falas</span>
                <span className="text-foreground">{localUtterances.length}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Participantes</span>
                <span className="text-foreground">{liveParticipants.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        )}
      </div>

      {videoStream && showPip && (
        <div
          className="fixed z-50 rounded-xl overflow-hidden shadow-2xl border-2 border-primary/40 bg-black"
          style={{
            width: pipSize.w,
            height: pipSize.h,
            ...(pipPos ? { left: pipPos.x, top: pipPos.y } : { bottom: 24, right: 24 }),
          }}
          data-testid="pip-container"
        >
          <video
            ref={pipVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain"
          />
          <div
            onMouseDown={handlePipDragStart}
            className="absolute top-0 left-0 right-8 h-7 cursor-grab active:cursor-grabbing flex items-center justify-center"
            data-testid="pip-drag-handle"
          >
            <Move className="h-3.5 w-3.5 text-white/60" />
          </div>
          <button
            onClick={() => setShowPip(false)}
            className="absolute top-1 right-1 bg-black/60 rounded-full p-1 text-white hover:bg-black/80 transition-colors"
            data-testid="button-close-pip"
          >
            <X className="h-3 w-3" />
          </button>
          <div className="absolute bottom-1 left-2 text-[10px] text-white/60 bg-black/50 px-1.5 py-0.5 rounded">
            {platformLabel(activeMeeting?.platform || "")}
          </div>
          <div
            onMouseDown={handlePipResizeStart}
            className="absolute bottom-0 right-0 w-12 h-12 cursor-se-resize flex items-end justify-end bg-gradient-to-tl from-primary/60 to-transparent rounded-tl-xl hover:from-primary/80 transition-colors border-t-2 border-l-2 border-dashed border-primary/50"
            title="Arraste para redimensionar"
            data-testid="pip-resize-handle"
          >
            <svg width="18" height="18" viewBox="0 0 14 14" className="text-white m-1.5 drop-shadow">
              <path d="M13 1L1 13M13 7L7 13M13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );

  const renderSummary = () => {
    if (!activeMeeting) return null;
    const m = activeMeeting;
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setView("list"); resetSetup(); }} data-testid="button-back-after-summary">
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h2 className="text-xl font-bold text-foreground">Resumo Executivo</h2>
            <Badge className="bg-green-600/20 text-green-400">Concluída</Badge>
          </div>
          {activeMeeting && (
            <Button
              onClick={() => resumeMeeting(activeMeeting.id)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-resume-meeting-summary"
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Retornar à Reunião
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary">{m.title}</CardTitle>
            <p className="text-sm text-slate-400">
              {platformLabel(m.platform)} • {roleLabel(m.legalRole)}
              {m.startedAt && ` • Início: ${format(new Date(m.startedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}`}
              {m.endedAt && ` • Fim: ${format(new Date(m.endedAt), "HH:mm", { locale: ptBR })}`}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {m.summary && (
              <div>
                <h3 className="text-foreground font-semibold mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Resumo</h3>
                <p className="text-muted-foreground text-sm whitespace-pre-wrap" data-testid="text-summary">{m.summary}</p>
              </div>
            )}

            {m.discProfiles && m.discProfiles.length > 0 && (
              <div>
                <h3 className="text-foreground font-semibold mb-3 flex items-center gap-2"><Brain className="h-4 w-4 text-purple-400" /> Perfis DISC</h3>
                <div className="grid gap-3">
                  {m.discProfiles.map((d, i) => {
                    const letter = getDiscLetter(d.profile);
                    return (
                      <div key={i} className={`rounded-lg border p-3 ${DISC_COLORS[letter] || DISC_COLORS.D}`} data-testid={`disc-profile-${i}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-bold">{letter}</span>
                          <span className="font-medium">{d.name}</span>
                          <Badge variant="outline" className="text-xs">{d.profile}</Badge>
                        </div>
                        <p className="text-sm opacity-80 mb-1">{d.description}</p>
                        <p className="text-sm font-medium">💡 {d.tip}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {m.decisions && (m.decisions).length > 0 && (
              <div>
                <h3 className="text-foreground font-semibold mb-2 flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-400" /> Decisões</h3>
                <ul className="space-y-1">
                  {(m.decisions).map((d, i) => (
                    <li key={i} className="text-muted-foreground text-sm flex items-start gap-2" data-testid={`text-decision-${i}`}>
                      <CheckCircle className="h-3 w-3 text-green-400 mt-1 flex-shrink-0" /> {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {m.actions && m.actions.length > 0 && (
              <div>
                <h3 className="text-foreground font-semibold mb-2 flex items-center gap-2"><Target className="h-4 w-4 text-blue-400" /> Ações</h3>
                <div className="space-y-2">
                  {m.actions.map((a, i) => (
                    <div key={i} className="bg-muted rounded p-3 text-sm" data-testid={`text-action-${i}`}>
                      <p className="text-muted-foreground">{a.description}</p>
                      <div className="flex gap-4 mt-1 text-xs text-slate-500">
                        <span>Responsável: {a.responsible}</span>
                        <span>Prazo: {a.deadline}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {m.risks && (m.risks).length > 0 && (
              <div>
                <h3 className="text-foreground font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-yellow-400" /> Riscos</h3>
                <ul className="space-y-1">
                  {(m.risks).map((r, i) => (
                    <li key={i} className="text-muted-foreground text-sm flex items-start gap-2" data-testid={`text-risk-${i}`}>
                      <AlertTriangle className="h-3 w-3 text-yellow-400 mt-1 flex-shrink-0" /> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {m.nextSteps && (m.nextSteps).length > 0 && (
              <div>
                <h3 className="text-foreground font-semibold mb-2 flex items-center gap-2"><ChevronRight className="h-4 w-4 text-primary" /> Próximos Passos</h3>
                <ul className="space-y-1">
                  {(m.nextSteps).map((s, i) => (
                    <li key={i} className="text-muted-foreground text-sm flex items-start gap-2" data-testid={`text-step-${i}`}>
                      <ChevronRight className="h-3 w-3 text-primary mt-1 flex-shrink-0" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {localUtterances.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Transcrição da Reunião</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-96">
                <div className="space-y-2">
                  {localUtterances.map((u, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="text-muted-foreground w-12 flex-shrink-0">{u.time}</span>
                      <span className="text-primary font-medium">{u.speakerName}:</span>
                      <span className="text-foreground">{u.text}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderDetail = () => {
    if (!activeMeeting) return null;
    const m = activeMeeting;
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView("list")} data-testid="button-back-detail">
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h2 className="text-xl font-bold text-foreground">{m.title}</h2>
            <Badge className={m.status === "completed" ? "bg-green-600/20 text-green-400" : m.status === "active" ? "bg-blue-600/20 text-blue-400" : "bg-yellow-600/20 text-yellow-400"}>
              {m.status === "completed" ? "Concluída" : m.status === "active" ? "Ativa" : "Setup"}
            </Badge>
          </div>
          {(m.status === "completed" || m.status === "active") && (
            <Button
              onClick={() => resumeMeeting(m.id)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-resume-meeting"
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Retornar à Reunião
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Plataforma:</span> <span className="text-foreground ml-2">{platformLabel(m.platform)}</span></div>
              <div><span className="text-muted-foreground">Papel:</span> <span className="text-foreground ml-2">{roleLabel(m.legalRole)}</span></div>
              <div><span className="text-muted-foreground">Criada:</span> <span className="text-foreground ml-2">{format(new Date(m.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span></div>
              {m.startedAt && <div><span className="text-muted-foreground">Início:</span> <span className="text-foreground ml-2">{format(new Date(m.startedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span></div>}
            </div>
          </CardContent>
        </Card>

        {m.summary && (
          <Card>
            <CardHeader><CardTitle className="text-primary text-base">Resumo Executivo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">{m.summary}</p>
              {m.decisions && (m.decisions).length > 0 && (
                <div>
                  <h4 className="text-foreground font-medium text-sm mb-1">Decisões:</h4>
                  <ul className="space-y-1">{(m.decisions).map((d, i) => <li key={i} className="text-muted-foreground text-sm">• {d}</li>)}</ul>
                </div>
              )}
              {m.actions && m.actions.length > 0 && (
                <div>
                  <h4 className="text-foreground font-medium text-sm mb-1">Ações:</h4>
                  {m.actions.map((a, i) => (
                    <div key={i} className="text-muted-foreground text-sm">• {a.description} (Resp: {a.responsible}, Prazo: {a.deadline})</div>
                  ))}
                </div>
              )}
              {m.risks && (m.risks).length > 0 && (
                <div>
                  <h4 className="text-foreground font-medium text-sm mb-1">Riscos:</h4>
                  <ul>{(m.risks).map((r, i) => <li key={i} className="text-muted-foreground text-sm">⚠ {r}</li>)}</ul>
                </div>
              )}
              {m.nextSteps && (m.nextSteps).length > 0 && (
                <div>
                  <h4 className="text-foreground font-medium text-sm mb-1">Próximos Passos:</h4>
                  <ul>{(m.nextSteps).map((s, i) => <li key={i} className="text-muted-foreground text-sm">→ {s}</li>)}</ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {m.utterances && m.utterances.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Transcrição ({m.utterances.length} falas)</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="max-h-96">
                <div className="space-y-2">
                  {m.utterances.map((u, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="text-slate-500 w-14 flex-shrink-0">{u.createdAt ? format(new Date(u.createdAt), "HH:mm") : ""}</span>
                      <span className="text-primary font-medium">{u.speakerName || "Participante"}:</span>
                      <span className="text-foreground">{u.text}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {m.participants && m.participants.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Participantes</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {m.participants.map((p, i) => (
                  <Badge key={i} variant="outline" className="text-foreground">{p.name}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderList = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" /> Copiloto de Reuniões
        </h2>
        <Button onClick={() => setView("setup")} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="button-new-meeting">
          <Plus className="h-4 w-4 mr-2" /> Nova Reunião
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar reuniões..." className="pl-10" data-testid="input-search-meetings" />
        </div>
      </div>

      {meetingsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredMeetings.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Video className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">Nenhuma reunião encontrada</p>
            <p className="text-muted-foreground/70 text-sm mb-4">Crie sua primeira reunião para começar a usar o copiloto.</p>
            <Button onClick={() => setView("setup")} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="button-new-meeting-empty">
              <Plus className="h-4 w-4 mr-2" /> Nova Reunião
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredMeetings.map(m => (
            <Card key={m.id} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => m.status === "active" ? resumeMeeting(m.id) : viewMeetingDetail(m.id)} data-testid={`card-meeting-${m.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Video className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="text-foreground font-medium" data-testid={`text-meeting-title-${m.id}`}>{m.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">{format(new Date(m.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                        <Badge variant="outline" className="text-xs text-slate-400 border-slate-600">{platformLabel(m.platform)}</Badge>
                        <Badge variant="outline" className="text-xs text-slate-400 border-slate-600">{roleLabel(m.legalRole)}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={m.status === "completed" ? "bg-green-600/20 text-green-400" : m.status === "active" ? "bg-blue-600/20 text-blue-400" : "bg-gray-600/20 text-gray-400"}>
                      {m.status === "completed" ? "Concluída" : m.status === "active" ? "Ativa" : "Setup"}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); deleteMeeting(m.id); }} className="text-red-400 hover:text-red-300 h-8 w-8" data-testid={`button-delete-meeting-${m.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="p-6">
        {view === "list" && renderList()}
        {view === "setup" && renderSetup()}
        {view === "active" && renderActive()}
        {view === "summary" && renderSummary()}
        {view === "detail" && renderDetail()}
      </div>
    </DashboardLayout>
  );
}
