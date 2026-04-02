import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { agendaApi, whatsappApi } from "@/lib/api";
import { format, addMonths, subMonths, addDays, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, ChevronLeft, ChevronRight, Clock, Gavel,
  Calendar as CalendarIcon, Users, Trash2, Pen,
  Loader2, MessageSquare, AlertTriangle, Wifi, WifiOff, QrCode, Phone, Copy, Send, Check, X
} from "lucide-react";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    type: "Compromisso",
    timeStart: "09:00",
    timeEnd: "10:00",
    responsible: "Dr. Ronald Serra",
    description: "",
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");

  const { data: dayEvents = [], isLoading: dayLoading } = useQuery({
    queryKey: ["agenda", selectedDateStr],
    queryFn: () => agendaApi.getByDate(selectedDateStr),
  });

  const { data: monthEvents = [] } = useQuery({
    queryKey: ["agenda-month", monthStart, monthEnd],
    queryFn: () => agendaApi.getByRange(monthStart, monthEnd),
  });

  const { data: whatsappContacts = [] } = useQuery({
    queryKey: ["whatsapp-contacts"],
    queryFn: whatsappApi.getContacts,
  });

  const { data: whatsappSchedule } = useQuery({
    queryKey: ["whatsapp-schedule"],
    queryFn: whatsappApi.getSchedule,
  });

  const { data: whatsappStatus } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: whatsappApi.getStatus,
    refetchInterval: 5000,
  });

  const connectWhatsappMutation = useMutation({
    mutationFn: () => whatsappApi.connect(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
      toast({ title: "Iniciando conexão WhatsApp..." });
    },
  });

  const disconnectWhatsappMutation = useMutation({
    mutationFn: whatsappApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
      toast({ title: "WhatsApp desconectado" });
    },
  });

  const [summaryPreview, setSummaryPreview] = useState<string | null>(null);
  const [editingSendTime, setEditingSendTime] = useState<string | null>(null);

  const [editingSocioPhone, setEditingSocioPhone] = useState<{ id: number; phone: string } | null>(null);

  const { data: socios = [] } = useQuery<{ id: number; name: string; email: string; phone: string | null; isActive: boolean }[]>({
    queryKey: ["team-socios"],
    queryFn: async () => {
      const r = await fetch("/api/team/socios", { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const updateSocioPhoneMutation = useMutation({
    mutationFn: ({ id, phone }: { id: number; phone: string }) =>
      fetch(`/api/team/socios/${id}/phone`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-socios"] });
      setEditingSocioPhone(null);
      toast({ title: "Telefone atualizado com sucesso!" });
    },
    onError: () => toast({ title: "Erro ao atualizar telefone", variant: "destructive" }),
  });

  const previewMutation = useMutation({
    mutationFn: whatsappApi.previewSummary,
    onSuccess: (data) => setSummaryPreview(data.summary),
  });

  const updateScheduleMutation = useMutation({
    mutationFn: (data: any) => whatsappApi.updateSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-schedule"] });
      setEditingSendTime(null);
      toast({ title: "Horário atualizado com sucesso!" });
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: whatsappApi.sendDailySummary,
    onSuccess: (data) => {
      toast({ title: `Resumo enviado para ${data.sent} contato(s)!` });
    },
    onError: () => {
      toast({ title: "Erro ao enviar resumo", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: agendaApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-month"] });
      setIsModalOpen(false);
      resetForm();
      toast({ title: "Evento criado com sucesso" });
    },
    onError: () => toast({ title: "Erro ao criar evento", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => agendaApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-month"] });
      setIsModalOpen(false);
      setEditingEvent(null);
      resetForm();
      toast({ title: "Evento atualizado com sucesso" });
    },
    onError: () => toast({ title: "Erro ao atualizar evento", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: agendaApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-month"] });
      setDeleteConfirm(null);
      toast({ title: "Evento excluído" });
    },
    onError: () => toast({ title: "Erro ao excluir evento", variant: "destructive" }),
  });

  const sendSummaryMutation = useMutation({
    mutationFn: whatsappApi.sendDailySummary,
    onSuccess: (data) => {
      toast({ title: `Resumo enviado! ${data.eventsCount} evento(s) no dia.` });
    },
    onError: () => toast({ title: "Erro ao enviar resumo", variant: "destructive" }),
  });

  const resetForm = () => {
    setForm({
      title: "",
      type: "Compromisso",
      timeStart: "09:00",
      timeEnd: "10:00",
      responsible: "Dr. Ronald Serra",
      description: "",
    });
  };

  const handleOpenNew = () => {
    setEditingEvent(null);
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (event: any) => {
    setEditingEvent(event);
    setForm({
      title: event.title,
      type: event.type,
      timeStart: event.timeStart,
      timeEnd: event.timeEnd || "",
      responsible: event.responsible,
      description: event.description || "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast({ title: "Informe o título do evento", variant: "destructive" });
      return;
    }
    const eventData = {
      ...form,
      date: selectedDateStr,
    };

    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: eventData });
    } else {
      createMutation.mutate(eventData);
    }
  };

  const sortedDayEvents = useMemo(() => {
    return [...dayEvents].sort((a: any, b: any) => a.timeStart.localeCompare(b.timeStart));
  }, [dayEvents]);

  const datesWithEvents = useMemo(() => {
    const dates = new Set<string>();
    monthEvents.forEach((e: any) => dates.add(e.date));
    return dates;
  }, [monthEvents]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case "Audiência": return <Gavel className="w-4 h-4 text-blue-600" />;
      case "Prazo": return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case "Reunião": return <Users className="w-4 h-4 text-purple-600" />;
      case "Compromisso": return <CalendarIcon className="w-4 h-4 text-green-600" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getEventBadgeClass = (type: string) => {
    switch (type) {
      case "Audiência": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Prazo": return "bg-red-100 text-red-700 border-red-200";
      case "Reunião": return "bg-purple-100 text-purple-700 border-purple-200";
      case "Compromisso": return "bg-green-100 text-green-700 border-green-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const getDateLabel = () => {
    if (selectedDateStr === todayStr) return "Hoje";
    if (selectedDateStr === yesterdayStr) return "Ontem";
    return format(selectedDate, "EEEE", { locale: ptBR });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-page-title">Agenda Jurídica</h1>
            <p className="text-muted-foreground mt-1">Controle de prazos, audiências e compromissos.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendSummaryMutation.mutate()}
              disabled={sendSummaryMutation.isPending}
              className="gap-1.5"
              data-testid="btn-send-whatsapp"
            >
              {sendSummaryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              Resumo WhatsApp
            </Button>
            <Button onClick={handleOpenNew} className="gap-1.5" data-testid="btn-new-event">
              <Plus className="w-4 h-4" />
              Novo Evento
            </Button>
          </div>
        </header>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>
            Envio automático: {whatsappSchedule?.sendTime || "07:00"} diariamente — somente para os sócios ({socios.filter(s => s.phone).length} com número cadastrado)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                    data-testid="btn-prev-month"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <h3 className="text-xs font-semibold capitalize">
                    {format(currentDate, "MMMM yyyy", { locale: ptBR })}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                    data-testid="btn-next-month"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setCurrentDate(d); } }}
                  month={currentDate}
                  onMonthChange={setCurrentDate}
                  locale={ptBR}
                  modifiers={{
                    hasEvents: (date) => datesWithEvents.has(format(date, "yyyy-MM-dd")),
                  }}
                  modifiersClassNames={{
                    hasEvents: "!font-bold relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-primary after:rounded-full",
                  }}
                  className="rounded-md w-full [--cell-size:1.6rem] text-xs mx-auto"
                  classNames={{
                    nav: "hidden",
                    month_caption: "hidden",
                  }}
                  data-testid="calendar-main"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  WhatsApp Diário
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {whatsappStatus?.status === "connected" ? (
                      <Wifi className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <span className="text-xs">
                      {whatsappStatus?.status === "connected" ? "Conectado" :
                       whatsappStatus?.status === "qr_ready" ? "Aguardando QR" :
                       whatsappStatus?.status === "connecting" ? "Conectando..." : "Desconectado"}
                    </span>
                  </div>
                  {whatsappStatus?.status === "connected" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => disconnectWhatsappMutation.mutate()}
                      data-testid="btn-disconnect-whatsapp"
                    >
                      Desconectar
                    </Button>
                  ) : whatsappStatus?.status !== "connecting" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => connectWhatsappMutation.mutate()}
                      disabled={connectWhatsappMutation.isPending}
                      data-testid="btn-connect-whatsapp"
                    >
                      <QrCode className="w-3 h-3" />
                      Conectar
                    </Button>
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {whatsappStatus?.status === "qr_ready" && whatsappStatus.qrCode && (
                  <div className="text-center p-2 border rounded-lg bg-white">
                    <img
                      src={whatsappStatus.qrCode}
                      alt="QR Code WhatsApp"
                      className="w-full max-w-[200px] mx-auto"
                      data-testid="img-qr-code"
                    />
                    <p className="text-[10px] text-muted-foreground mt-2">Escaneie com seu WhatsApp</p>
                  </div>
                )}

                <div className="border-t pt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Envio diário:</div>
                    {editingSendTime !== null ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="time"
                          value={editingSendTime}
                          onChange={(e) => setEditingSendTime(e.target.value)}
                          className="h-6 w-24 text-xs px-1"
                          data-testid="input-send-time"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            updateScheduleMutation.mutate({
                              sendTime: editingSendTime,
                              isActive: true,
                            });
                          }}
                          disabled={updateScheduleMutation.isPending}
                          data-testid="btn-save-time"
                        >
                          {updateScheduleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-green-600" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setEditingSendTime(null)}
                          data-testid="btn-cancel-time"
                        >
                          <X className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="text-xs font-medium text-foreground hover:underline cursor-pointer flex items-center gap-1"
                        onClick={() => setEditingSendTime(whatsappSchedule?.sendTime || "07:00")}
                        data-testid="btn-edit-time"
                      >
                        {whatsappSchedule?.sendTime || "07:00"} (Brasília)
                        <Pen className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">Contatos:</div>
                  {whatsappContacts.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3" />
                        <span>{c.contactName || "Contato"}</span>
                      </div>
                      <span className="text-muted-foreground font-mono text-[10px]">{c.phoneNumber}</span>
                    </div>
                  ))}

                  <div className="text-xs text-muted-foreground mt-1">Sócios (notificação automática):</div>
                  {socios.map((s) => {
                    const isEditing = editingSocioPhone?.id === s.id;
                    const hasPhone = !!s.phone;
                    return (
                      <div key={s.id} className={`flex items-center justify-between text-xs p-1.5 rounded ${hasPhone ? "bg-green-50 dark:bg-green-950/20" : "bg-amber-50 dark:bg-amber-950/20"}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Users className="w-3 h-3 shrink-0" />
                          <span className="truncate">{s.name}</span>
                        </div>
                        {isEditing ? (
                          <div className="flex items-center gap-1 ml-2">
                            <Input
                              value={editingSocioPhone.phone}
                              onChange={e => setEditingSocioPhone({ id: s.id, phone: e.target.value })}
                              placeholder="+5561..."
                              className="h-5 text-[10px] w-28 px-1"
                              data-testid={`input-socio-phone-${s.id}`}
                              onKeyDown={e => {
                                if (e.key === "Enter") updateSocioPhoneMutation.mutate({ id: s.id, phone: editingSocioPhone.phone });
                                if (e.key === "Escape") setEditingSocioPhone(null);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0"
                              onClick={() => updateSocioPhoneMutation.mutate({ id: s.id, phone: editingSocioPhone.phone })}
                              disabled={updateSocioPhoneMutation.isPending}
                              data-testid={`btn-save-socio-phone-${s.id}`}
                            >
                              {updateSocioPhoneMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-green-600" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingSocioPhone(null)} data-testid={`btn-cancel-socio-phone-${s.id}`}>
                              <X className="w-3 h-3 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className={`text-[10px] font-mono flex items-center gap-1 hover:underline cursor-pointer ${hasPhone ? "text-green-700 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}
                            onClick={() => setEditingSocioPhone({ id: s.id, phone: s.phone || "" })}
                            data-testid={`btn-edit-socio-phone-${s.id}`}
                            title="Clique para editar o número"
                          >
                            {hasPhone ? s.phone : "sem número"}
                            <Pen className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t pt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-[10px] gap-1"
                    onClick={() => previewMutation.mutate()}
                    disabled={previewMutation.isPending}
                    data-testid="btn-preview-summary"
                  >
                    {previewMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                    Pré-visualizar
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 h-7 text-[10px] gap-1"
                    onClick={() => sendNowMutation.mutate()}
                    disabled={sendNowMutation.isPending || whatsappStatus?.status !== "connected"}
                    data-testid="btn-send-now"
                  >
                    {sendNowMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Enviar Agora
                  </Button>
                </div>
              </CardContent>
            </Card>

            {summaryPreview && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span>Resumo do Dia</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => {
                        navigator.clipboard.writeText(summaryPreview);
                        toast({ title: "Copiado para a área de transferência!" });
                      }}
                      data-testid="btn-copy-summary"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copiar
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs whitespace-pre-wrap bg-muted/50 p-3 rounded-lg leading-relaxed">{summaryPreview}</pre>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-8 space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedDate(subDays(selectedDate, 1))}
                    data-testid="btn-prev-day"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <div className="text-center">
                    <h2 className="text-xl font-bold capitalize" data-testid="text-selected-date">
                      {getDateLabel()}, {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sortedDayEvents.length} evento(s) agendado(s)
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                    data-testid="btn-next-day"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>

                <div className="space-y-3">
                  {dayLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : sortedDayEvents.length > 0 ? (
                    sortedDayEvents.map((event: any) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-4 p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors group relative"
                        data-testid={`card-event-${event.id}`}
                      >
                        <div className="text-center min-w-[60px] border-r pr-4">
                          <p className="text-lg font-bold">{event.timeStart}</p>
                          {event.timeEnd && (
                            <p className="text-xs text-muted-foreground">{event.timeEnd}</p>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {getEventIcon(event.type)}
                            <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${getEventBadgeClass(event.type)}`}>
                              {event.type}
                            </span>
                            {event.sourceType !== "manual" && (
                              <Badge variant="outline" className="text-[10px]">
                                {event.sourceType === "escavador" ? "Escavador" : "Sistema"}
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-semibold text-sm">{event.title}</h4>
                          {event.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">{event.responsible}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {event.sourceType === "manual" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleOpenEdit(event)}
                                data-testid={`btn-edit-event-${event.id}`}
                              >
                                <Pen className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => setDeleteConfirm(event.id)}
                                data-testid={`btn-delete-event-${event.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                      <h3 className="text-lg font-medium text-muted-foreground">Nenhum evento agendado</h3>
                      <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Novo Evento" para adicionar.</p>
                      <Button onClick={handleOpenNew} variant="outline" className="mt-4 gap-1.5" data-testid="btn-new-event-empty">
                        <Plus className="w-4 h-4" />
                        Novo Evento
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle data-testid="text-modal-title">
              {editingEvent ? "Editar Evento" : "Novo Evento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="event-title">Título</Label>
              <Input
                id="event-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Audiência de instrução"
                data-testid="input-event-title"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger data-testid="select-event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Compromisso">Compromisso</SelectItem>
                  <SelectItem value="Audiência">Audiência</SelectItem>
                  <SelectItem value="Prazo">Prazo</SelectItem>
                  <SelectItem value="Reunião">Reunião</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="event-start">Início</Label>
                <Input
                  id="event-start"
                  type="time"
                  value={form.timeStart}
                  onChange={(e) => setForm({ ...form, timeStart: e.target.value })}
                  data-testid="input-event-start"
                />
              </div>
              <div>
                <Label htmlFor="event-end">Fim</Label>
                <Input
                  id="event-end"
                  type="time"
                  value={form.timeEnd}
                  onChange={(e) => setForm({ ...form, timeEnd: e.target.value })}
                  data-testid="input-event-end"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="event-responsible">Responsável</Label>
              <Input
                id="event-responsible"
                value={form.responsible}
                onChange={(e) => setForm({ ...form, responsible: e.target.value })}
                data-testid="input-event-responsible"
              />
            </div>
            <div>
              <Label htmlFor="event-description">Descrição (opcional)</Label>
              <Textarea
                id="event-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Detalhes adicionais..."
                rows={3}
                data-testid="input-event-description"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)} data-testid="btn-cancel-event">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="btn-save-event"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingEvent ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Excluir evento?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} data-testid="btn-cancel-delete">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
              data-testid="btn-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
