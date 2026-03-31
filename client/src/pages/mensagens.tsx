import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { whatsappApi, secretaryApi } from "@/lib/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Send, MessageSquare, Search, Phone, Wifi, WifiOff,
  QrCode, Loader2, Check, CheckCheck, ArrowLeft, User, Users,
  Bot, Settings, Activity, Clock, Shield, Zap,
  ThumbsUp, ThumbsDown, Edit3, Eye, AlertTriangle,
  Calendar, FileText, HelpCircle, Bell, Plus, Paperclip, X
} from "lucide-react";
import { cn } from "@/lib/utils";

type MainTab = "chat" | "painel" | "config";

function ConfigPanel({ secretaryConfig, updateConfigMutation }: { secretaryConfig: any; updateConfigMutation: any }) {
  const defaults = {
    mode: "semi_auto",
    systemPrompt: "",
    businessHoursStart: "08:00",
    businessHoursEnd: "18:00",
    workOnWeekends: false,
    offHoursMessage: "Obrigada pelo contato! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos em breve.",
    isActive: false,
  };

  const [localConfig, setLocalConfig] = useState({ ...defaults });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (secretaryConfig) {
      setLocalConfig({
        mode: secretaryConfig.mode || defaults.mode,
        systemPrompt: secretaryConfig.systemPrompt || "",
        businessHoursStart: secretaryConfig.businessHoursStart || defaults.businessHoursStart,
        businessHoursEnd: secretaryConfig.businessHoursEnd || defaults.businessHoursEnd,
        workOnWeekends: secretaryConfig.workOnWeekends ?? false,
        offHoursMessage: secretaryConfig.offHoursMessage || defaults.offHoursMessage,
        isActive: secretaryConfig.isActive ?? false,
      });
      setHasChanges(false);
    }
  }, [secretaryConfig]);

  const updateLocal = (field: string, value: any) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const saveConfig = () => {
    updateConfigMutation.mutate(localConfig, {
      onSuccess: () => setHasChanges(false),
    });
  };

  const toggleImmediate = (field: string, value: any) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
    updateConfigMutation.mutate({ [field]: value });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Secretária LexAI</h3>
              <p className="text-xs text-muted-foreground">Assistente virtual inteligente</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="secretary-active" className="text-sm">
              {localConfig.isActive ? "Ativa" : "Inativa"}
            </Label>
            <Switch
              id="secretary-active"
              checked={localConfig.isActive}
              onCheckedChange={(checked) => toggleImmediate("isActive", checked)}
              data-testid="switch-secretary-active"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Modo de Operação</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    localConfig.mode === "auto"
                      ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                  onClick={() => toggleImmediate("mode", "auto")}
                  data-testid="btn-mode-auto"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">Automático</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Responde imediatamente sem aprovação
                  </p>
                </button>
                <button
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    localConfig.mode === "semi_auto"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                  onClick={() => toggleImmediate("mode", "semi_auto")}
                  data-testid="btn-mode-semi"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">Semi-Auto</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Gera rascunho para sua aprovação
                  </p>
                </button>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Horário de Atendimento</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={localConfig.businessHoursStart}
                  onChange={(e) => updateLocal("businessHoursStart", e.target.value)}
                  className="w-28 h-9 text-sm"
                  data-testid="input-hours-start"
                />
                <span className="text-sm text-muted-foreground">até</span>
                <Input
                  type="time"
                  value={localConfig.businessHoursEnd}
                  onChange={(e) => updateLocal("businessHoursEnd", e.target.value)}
                  className="w-28 h-9 text-sm"
                  data-testid="input-hours-end"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="work-weekends"
                checked={localConfig.workOnWeekends}
                onCheckedChange={(checked) => toggleImmediate("workOnWeekends", checked)}
                data-testid="switch-weekends"
              />
              <Label htmlFor="work-weekends" className="text-sm">Funcionar nos finais de semana</Label>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Mensagem Fora do Horário</Label>
              <Textarea
                value={localConfig.offHoursMessage}
                onChange={(e) => updateLocal("offHoursMessage", e.target.value)}
                placeholder="Mensagem enviada fora do horário comercial..."
                className="text-sm min-h-[80px]"
                data-testid="textarea-off-hours"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Instruções Personalizadas (opcional)</Label>
              <Textarea
                value={localConfig.systemPrompt}
                onChange={(e) => updateLocal("systemPrompt", e.target.value)}
                placeholder="Ex: Sempre priorize agendamentos para terça e quinta. O Dr. Ronald não atende às quartas..."
                className="text-sm min-h-[100px]"
                data-testid="textarea-system-prompt"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Adicione instruções específicas sobre como a secretária deve se comportar
              </p>
            </div>
          </div>
        </div>

        {hasChanges && (
          <div className="flex justify-end mt-4 pt-4 border-t">
            <Button
              onClick={saveConfig}
              disabled={updateConfigMutation.isPending}
              className="gap-2"
              data-testid="btn-save-config"
            >
              {updateConfigMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Salvar Configuração
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <HelpCircle className="w-4 h-4" />
          Como funciona a Secretária LexAI
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Recebe Mensagens</p>
              <p className="text-xs text-muted-foreground">Processa automaticamente todas as mensagens do WhatsApp durante o horário comercial</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Analisa com IA</p>
              <p className="text-xs text-muted-foreground">Entende o contexto, consulta a agenda e dados do escritório para responder</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <Send className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Responde ao Cliente</p>
              <p className="text-xs text-muted-foreground">No modo automático envia direto; no semi-auto aguarda sua aprovação</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function MensagensPage() {
  const [mainTab, setMainTab] = useState<MainTab>("painel");
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingDraft, setEditingDraft] = useState<{ id: number; message: string } | null>(null);
  const [showNewConvDialog, setShowNewConvDialog] = useState(false);
  const [newConvPhone, setNewConvPhone] = useState("");
  const [newConvMessage, setNewConvMessage] = useState("");
  const [newConvFile, setNewConvFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newConvFileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: conversations = [] } = useQuery({
    queryKey: ["whatsapp-conversations"],
    queryFn: whatsappApi.getConversations,
    refetchInterval: 5000,
  });

  const { data: whatsappStatus } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: whatsappApi.getStatus,
    refetchInterval: 2000,
  });

  const { data: chatMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["whatsapp-chat", selectedJid],
    queryFn: () => selectedJid ? whatsappApi.getMessages(selectedJid) : Promise.resolve([]),
    enabled: !!selectedJid,
    refetchInterval: 3000,
  });

  const { data: secretaryConfig, isLoading: configLoading } = useQuery({
    queryKey: ["secretary-config"],
    queryFn: secretaryApi.getConfig,
  });

  const { data: secretaryActions = [] } = useQuery({
    queryKey: ["secretary-actions"],
    queryFn: () => secretaryApi.getActions(100),
    refetchInterval: 5000,
  });

  const { data: pendingActions = [] } = useQuery({
    queryKey: ["secretary-pending"],
    queryFn: secretaryApi.getPending,
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: ({ jid, message }: { jid: string; message: string }) =>
      whatsappApi.sendChatMessage(jid, message),
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-chat", selectedJid] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
    onError: () => {
      toast({ title: "Erro ao enviar mensagem", variant: "destructive" });
    },
  });

  const sendFileMutation = useMutation({
    mutationFn: ({ jid, file }: { jid: string; file: File }) =>
      whatsappApi.sendFile(jid, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-chat", selectedJid] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      toast({ title: "Arquivo enviado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Erro ao enviar arquivo", variant: "destructive" });
    },
  });

  const sendToNumberMutation = useMutation({
    mutationFn: async ({ phoneNumber, message, file }: { phoneNumber: string; message: string; file?: File | null }) => {
      let cleaned = phoneNumber.replace(/\D/g, "");
      if (cleaned.length === 11 || cleaned.length === 10) cleaned = "55" + cleaned;
      const jid = `${cleaned}@s.whatsapp.net`;
      if (message.trim()) {
        await whatsappApi.sendToNumber(phoneNumber, message);
      }
      if (file) {
        await whatsappApi.sendFile(jid, file);
      }
      return { jid };
    },
    onSuccess: (data) => {
      setNewConvPhone("");
      setNewConvMessage("");
      setNewConvFile(null);
      setShowNewConvDialog(false);
      toast({ title: "Mensagem enviada com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      if (data?.jid) {
        setSelectedJid(data.jid);
        queryClient.invalidateQueries({ queryKey: ["whatsapp-chat", data.jid] });
      }
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Erro ao enviar mensagem", variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (jid: string) => whatsappApi.markRead(jid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-unread"] });
    },
  });

  const connectMutation = useMutation({
    mutationFn: () => whatsappApi.connect(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: (data: any) => secretaryApi.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secretary-config"] });
      toast({ title: "Configuração atualizada" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => secretaryApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secretary-pending"] });
      queryClient.invalidateQueries({ queryKey: ["secretary-actions"] });
      toast({ title: "Mensagem aprovada e enviada" });
    },
  });

  const editSendMutation = useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) =>
      secretaryApi.editAndSend(id, message),
    onSuccess: () => {
      setEditingDraft(null);
      queryClient.invalidateQueries({ queryKey: ["secretary-pending"] });
      queryClient.invalidateQueries({ queryKey: ["secretary-actions"] });
      toast({ title: "Mensagem editada e enviada" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => secretaryApi.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secretary-pending"] });
      queryClient.invalidateQueries({ queryKey: ["secretary-actions"] });
      toast({ title: "Rascunho rejeitado" });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (selectedJid) {
      const conv = conversations.find((c: any) => c.jid === selectedJid);
      if (conv?.unreadCount > 0) {
        markReadMutation.mutate(selectedJid);
      }
    }
  }, [selectedJid, conversations]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phone = params.get("phone");
    const prospecting = params.get("prospecting");
    const message = params.get("message");
    if (phone && prospecting === "true") {
      setMainTab("chat");
      setShowNewConvDialog(true);
      setNewConvPhone(phone);
      if (message) setNewConvMessage(decodeURIComponent(message));
      window.history.replaceState({}, "", "/mensagens");
    }
  }, []);

  const handleSend = () => {
    if (!selectedJid || !messageText.trim()) return;
    sendMutation.mutate({ jid: selectedJid, message: messageText.trim() });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedJid) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande (máximo 50MB)", variant: "destructive" });
      return;
    }
    sendFileMutation.mutate({ jid: selectedJid, file });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredConversations = conversations.filter((c: any) =>
    !searchTerm || c.contactName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phoneNumber?.includes(searchTerm)
  );

  const selectedConv = conversations.find((c: any) => c.jid === selectedJid);
  const isConnected = whatsappStatus?.status === "connected";
  const isQrReady = whatsappStatus?.status === "qr_ready";

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isToday) return format(date, "HH:mm");
    if (isYesterday) return "Ontem " + format(date, "HH:mm");
    return format(date, "dd/MM HH:mm");
  };

  const formatConvTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return format(date, "HH:mm");
    return format(date, "dd/MM", { locale: ptBR });
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "agendamento": return <Calendar className="w-4 h-4 text-blue-500" />;
      case "relatorio": return <FileText className="w-4 h-4 text-purple-500" />;
      case "urgencia": return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "resposta_auto": return <Zap className="w-4 h-4 text-green-500" />;
      case "resposta_pendente": return <Clock className="w-4 h-4 text-amber-500" />;
      case "fora_horario": return <Clock className="w-4 h-4 text-gray-500" />;
      case "erro": return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-[10px]">Concluído</Badge>;
      case "pending_approval": return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[10px]">Pendente</Badge>;
      case "needs_attention": return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-[10px]">Atenção</Badge>;
      case "error": return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-[10px]">Erro</Badge>;
      case "rejected": return <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50 text-[10px]">Rejeitado</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const renderPainelTab = () => {
    const isActive = secretaryConfig?.isActive;
    const mode = secretaryConfig?.mode || "semi_auto";
    const completedToday = secretaryActions.filter((a: any) =>
      a.status === "completed" && new Date(a.timestamp).toDateString() === new Date().toDateString()
    ).length;
    const urgentCount = secretaryActions.filter((a: any) =>
      a.status === "needs_attention"
    ).length;

    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center",
                isActive ? "bg-green-100" : "bg-gray-100"
              )}>
                <Bot className={cn("w-5 h-5", isActive ? "text-green-600" : "text-gray-400")} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-semibold" data-testid="text-secretary-status">
                  {isActive ? "Ativa" : "Inativa"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Modo</p>
                <p className="text-sm font-semibold" data-testid="text-secretary-mode">
                  {mode === "auto" ? "Automático" : "Semi-Auto"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Bell className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-sm font-semibold" data-testid="text-pending-count">{pendingActions.length}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCheck className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Atendidas Hoje</p>
                <p className="text-sm font-semibold" data-testid="text-completed-today">{completedToday}</p>
              </div>
            </div>
          </Card>
        </div>

        {pendingActions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Rascunhos Pendentes de Aprovação ({pendingActions.length})
            </h3>
            <div className="space-y-3">
              {pendingActions.map((action: any) => (
                <Card key={action.id} className="p-4 border-l-4 border-l-amber-400" data-testid={`pending-action-${action.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{action.contactName}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(action.timestamp), "dd/MM HH:mm")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{action.description}</p>
                      {editingDraft?.id === action.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editingDraft?.message || ""}
                            onChange={(e) => editingDraft && setEditingDraft({ id: editingDraft.id, message: e.target.value })}
                            className="text-sm min-h-[80px]"
                            data-testid={`textarea-edit-draft-${action.id}`}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => editingDraft && editSendMutation.mutate({ id: action.id, message: editingDraft.message })}
                              disabled={editSendMutation.isPending}
                              data-testid={`btn-send-edited-${action.id}`}
                            >
                              <Send className="w-3 h-3 mr-1" /> Enviar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingDraft(null)}
                              data-testid={`btn-cancel-edit-${action.id}`}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-sm">
                          <p className="text-xs text-muted-foreground mb-1 font-medium">Rascunho da IA:</p>
                          <p className="whitespace-pre-wrap">{action.draftMessage}</p>
                        </div>
                      )}
                    </div>
                    {editingDraft?.id !== action.id && (
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-green-600 hover:bg-green-50"
                          onClick={() => approveMutation.mutate(action.id)}
                          disabled={approveMutation.isPending}
                          data-testid={`btn-approve-${action.id}`}
                        >
                          <ThumbsUp className="w-3 h-3 mr-1" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => setEditingDraft({ id: action.id, message: action.draftMessage || "" })}
                          data-testid={`btn-edit-${action.id}`}
                        >
                          <Edit3 className="w-3 h-3 mr-1" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-red-600 hover:bg-red-50"
                          onClick={() => rejectMutation.mutate(action.id)}
                          disabled={rejectMutation.isPending}
                          data-testid={`btn-reject-${action.id}`}
                        >
                          <ThumbsDown className="w-3 h-3 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {urgentCount > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              Atenção Necessária ({urgentCount})
            </h3>
            <div className="space-y-2">
              {secretaryActions
                .filter((a: any) => a.status === "needs_attention")
                .map((action: any) => (
                  <Card key={action.id} className="p-3 border-l-4 border-l-red-400" data-testid={`urgent-action-${action.id}`}>
                    <div className="flex items-center gap-2">
                      {getActionIcon(action.actionType)}
                      <div className="flex-1">
                        <span className="text-sm font-medium">{action.contactName}</span>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(action.timestamp), "dd/MM HH:mm")}
                      </span>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Histórico de Ações
          </h3>
          <div className="space-y-2">
            {secretaryActions.length === 0 ? (
              <Card className="p-6 text-center">
                <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ative a secretária para começar a processar mensagens
                </p>
              </Card>
            ) : (
              secretaryActions.slice(0, 30).map((action: any) => (
                <Card key={action.id} className="p-3" data-testid={`action-${action.id}`}>
                  <div className="flex items-center gap-3">
                    {getActionIcon(action.actionType)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{action.contactName}</span>
                        {getStatusBadge(action.status)}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{action.description}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {format(new Date(action.timestamp), "dd/MM HH:mm")}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderConfigTab = () => {
    return <ConfigPanel
      secretaryConfig={secretaryConfig}
      updateConfigMutation={updateConfigMutation}
    />;
  };

  const renderChatTab = () => (
    <div className="flex-1 flex gap-0 border rounded-xl overflow-hidden bg-background shadow-sm min-h-0">
      <div className={cn(
        "w-full md:w-[360px] md:min-w-[360px] flex flex-col border-r bg-card",
        selectedJid && "hidden md:flex"
      )}>
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contato..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm"
                data-testid="input-search-contacts"
              />
            </div>
            <Button
              size="icon"
              className="h-9 w-9 bg-green-600 hover:bg-green-700 flex-shrink-0"
              onClick={() => setShowNewConvDialog(true)}
              disabled={!isConnected}
              title="Nova Conversa"
              data-testid="btn-new-conversation"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!isConnected && (
            <div className="p-3 border-b">
              {isQrReady && whatsappStatus?.qrCode ? (
                <div className="flex flex-col items-center p-3 text-center">
                  <img src={whatsappStatus.qrCode} alt="QR Code" className="w-40 h-40 mb-2" data-testid="img-qr-code-main" />
                  <p className="text-xs text-muted-foreground">Escaneie o QR Code com seu WhatsApp</p>
                  <div className="text-xs text-muted-foreground text-left space-y-0.5 w-full mt-2">
                    <p className="font-medium">No seu celular:</p>
                    <p>1. WhatsApp → Configurações → Aparelhos Conectados</p>
                    <p>2. Conectar Aparelho</p>
                    <p>3. Escaneie o QR Code acima</p>
                  </div>
                </div>
              ) : whatsappStatus?.status === "connecting" ? (
                <div className="flex flex-col items-center p-6 text-center" data-testid="whatsapp-connecting">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600 mb-3" />
                  <span className="text-sm font-medium">Conectando ao WhatsApp...</span>
                  <p className="text-xs text-muted-foreground mt-1">Aguarde enquanto estabelecemos a conexão</p>
                </div>
              ) : (
                <div className="flex flex-col items-center p-3 text-center">
                  <div className="flex items-center gap-2 mb-2">
                    <WifiOff className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium">WhatsApp Desconectado</span>
                  </div>
                  <div className="space-y-2 w-full max-w-xs">
                    <Button
                      size="sm"
                      className="gap-2 w-full"
                      onClick={() => connectMutation.mutate()}
                      disabled={connectMutation.isPending}
                      data-testid="btn-connect-whatsapp-main"
                    >
                      {connectMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <QrCode className="w-4 h-4" />
                      )}
                      Conectar WhatsApp
                    </Button>
                    {whatsappStatus?.message && whatsappStatus.status === "disconnected" && whatsappStatus.message !== "" && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700" data-testid="whatsapp-status-message">
                        {whatsappStatus.message}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {filteredConversations.map((conv: any) => (
            <div
              key={conv.jid}
              className={cn(
                "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-border/50",
                selectedJid === conv.jid ? "bg-accent" : "hover:bg-muted/50"
              )}
              onClick={() => setSelectedJid(conv.jid)}
              data-testid={`conv-item-${conv.jid}`}
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                conv.isGroup ? "bg-blue-100" : "bg-green-100"
              )}>
                {conv.isGroup ? (
                  <Users className="w-5 h-5 text-blue-700" />
                ) : (
                  <User className="w-5 h-5 text-green-700" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{conv.contactName}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                    {conv.lastTimestamp ? formatConvTime(conv.lastTimestamp) : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-muted-foreground truncate pr-2">{conv.lastMessage}</p>
                  {conv.unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-green-600 rounded-full flex-shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={cn("flex-1 flex flex-col min-w-0", !selectedJid && "hidden md:flex")}>
        {selectedJid ? (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setSelectedJid(null)} data-testid="btn-back-to-list">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center",
                selectedConv?.isGroup ? "bg-blue-100" : "bg-green-100"
              )}>
                {selectedConv?.isGroup ? (
                  <Users className="w-5 h-5 text-blue-700" />
                ) : (
                  <User className="w-5 h-5 text-green-700" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium truncate" data-testid="text-chat-contact-name">
                  {selectedConv?.contactName || selectedJid}
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {selectedConv?.isGroup ? (
                    <><Users className="w-3 h-3 inline mr-1" />Grupo</>
                  ) : (
                    <><Phone className="w-3 h-3 inline mr-1" />{selectedConv?.phoneNumber || selectedJid.replace("@s.whatsapp.net", "").replace("@lid", "")}</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#f0f2f5] dark:bg-muted/20" data-testid="chat-messages-area">
              {messagesLoading && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!messagesLoading && chatMessages.length === 0 && (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Nenhuma mensagem nesta conversa
                </div>
              )}
              {chatMessages.map((msg: any, idx: number) => {
                const isOutgoing = msg.direction === "outgoing";
                const showDate = idx === 0 || (
                  new Date(chatMessages[idx - 1]?.timestamp).toDateString() !== new Date(msg.timestamp).toDateString()
                );
                return (
                  <div key={msg.id || idx}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-[10px] bg-white dark:bg-card px-3 py-1 rounded-full text-muted-foreground shadow-sm">
                          {format(new Date(msg.timestamp), "dd 'de' MMMM", { locale: ptBR })}
                        </span>
                      </div>
                    )}
                    <div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[75%] px-3 py-2 rounded-lg text-sm shadow-sm",
                        isOutgoing
                          ? "bg-[#d9fdd3] dark:bg-green-900/40 text-foreground rounded-br-sm"
                          : "bg-white dark:bg-card text-foreground rounded-bl-sm"
                      )} data-testid={`msg-bubble-${msg.id || idx}`}>
                        {!isOutgoing && msg.senderName && (
                          <p className="text-[10px] font-medium text-green-700 dark:text-green-400 mb-0.5">{msg.senderName}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                        <div className={cn("flex items-center gap-1 mt-1", isOutgoing ? "justify-end" : "justify-start")}>
                          <span className="text-[10px] text-muted-foreground">{formatMessageTime(msg.timestamp)}</span>
                          {isOutgoing && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t bg-card">
              {selectedConv?.isGroup ? (
                <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5 mr-1.5" />
                  Envio de mensagens para grupos não está disponível
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mp3,.ogg,.wav"
                    data-testid="input-file-upload"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isConnected || sendFileMutation.isPending}
                    data-testid="btn-attach-file"
                    title="Anexar arquivo"
                  >
                    {sendFileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  </Button>
                  <Input
                    placeholder={isConnected ? "Digite uma mensagem..." : "WhatsApp desconectado"}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!isConnected || sendMutation.isPending}
                    className="flex-1 h-10"
                    data-testid="input-message-text"
                  />
                  <Button
                    size="icon"
                    className="h-10 w-10 flex-shrink-0 bg-green-600 hover:bg-green-700"
                    onClick={handleSend}
                    disabled={!isConnected || !messageText.trim() || sendMutation.isPending}
                    data-testid="btn-send-message"
                  >
                    {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <MessageSquare className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-lg font-medium mb-1">LexAI Mensagens</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Envie e receba mensagens do WhatsApp diretamente pelo sistema.
              Selecione uma conversa ao lado para começar.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-2rem)] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-serif font-bold flex items-center gap-2" data-testid="text-page-title">
              <Bot className="w-6 h-6 text-purple-600" />
              Secretária LexAI
            </h1>
            <p className="text-sm text-muted-foreground">Assistente virtual inteligente para atendimento via WhatsApp</p>
          </div>
          <div className="flex items-center gap-2">
            {secretaryConfig?.isActive && (
              <div className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full">
                <Bot className="w-3.5 h-3.5" />
                IA {secretaryConfig.mode === "auto" ? "Auto" : "Semi"}
              </div>
            )}
            {isConnected ? (
              <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                <Wifi className="w-3.5 h-3.5" />
                Conectado
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                <WifiOff className="w-3.5 h-3.5" />
                Desconectado
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-1 mb-4 bg-muted/50 p-1 rounded-lg w-fit">
          <button
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-all",
              mainTab === "painel"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMainTab("painel")}
            data-testid="tab-painel"
          >
            <Activity className="w-4 h-4" />
            Painel
            {pendingActions.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-amber-500 rounded-full">
                {pendingActions.length}
              </span>
            )}
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-all",
              mainTab === "chat"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMainTab("chat")}
            data-testid="tab-chat"
          >
            <MessageSquare className="w-4 h-4" />
            Conversas
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-all",
              mainTab === "config"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMainTab("config")}
            data-testid="tab-config"
          >
            <Settings className="w-4 h-4" />
            Configuração
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {mainTab === "painel" && renderPainelTab()}
          {mainTab === "chat" && renderChatTab()}
          {mainTab === "config" && renderConfigTab()}
        </div>
      </div>

      <Dialog open={showNewConvDialog} onOpenChange={(open) => { setShowNewConvDialog(open); if (!open) setNewConvFile(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-green-600" />
              Nova Conversa WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="new-conv-phone" className="text-sm font-medium">Número do celular</Label>
              <Input
                id="new-conv-phone"
                placeholder="(61) 99999-9999"
                value={newConvPhone}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, "");
                  if (v.length > 11) v = v.slice(0, 11);
                  if (v.length > 7) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
                  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
                  else if (v.length > 0) v = `(${v}`;
                  setNewConvPhone(v);
                }}
                className="mt-1"
                data-testid="input-new-conv-phone"
              />
              <p className="text-xs text-muted-foreground mt-1">DDD + número. Não precisa ser cliente cadastrado.</p>
            </div>
            <div>
              <Label htmlFor="new-conv-message" className="text-sm font-medium">Mensagem</Label>
              <Textarea
                id="new-conv-message"
                placeholder="Digite sua mensagem..."
                value={newConvMessage}
                onChange={(e) => setNewConvMessage(e.target.value)}
                rows={3}
                className="mt-1 resize-none"
                data-testid="input-new-conv-message"
              />
            </div>
            <div>
              <input
                type="file"
                ref={newConvFileInputRef}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 50 * 1024 * 1024) {
                      toast({ title: "Arquivo muito grande (máximo 50MB)", variant: "destructive" });
                      return;
                    }
                    setNewConvFile(f);
                  }
                  if (newConvFileInputRef.current) newConvFileInputRef.current.value = "";
                }}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mp3,.ogg,.wav"
                data-testid="input-new-conv-file"
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => newConvFileInputRef.current?.click()}
                data-testid="btn-new-conv-attach"
              >
                <Paperclip className="w-4 h-4" />
                Anexar arquivo
              </Button>
              {newConvFile && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                  <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="truncate flex-1">{newConvFile.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => setNewConvFile(null)}
                    data-testid="btn-new-conv-remove-file"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700"
              disabled={!newConvPhone || newConvPhone.replace(/\D/g, "").length < 10 || (!newConvMessage.trim() && !newConvFile) || sendToNumberMutation.isPending}
              onClick={() => {
                const cleaned = newConvPhone.replace(/\D/g, "");
                sendToNumberMutation.mutate({ phoneNumber: cleaned, message: newConvMessage.trim(), file: newConvFile });
              }}
              data-testid="btn-send-new-conv"
            >
              {sendToNumberMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
