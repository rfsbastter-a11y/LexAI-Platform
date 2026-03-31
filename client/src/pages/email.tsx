import { useState, useEffect, useRef } from "react";
import { getAuthHeaders } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import DOMPurify from "dompurify";
import RichTextEditor from "@/components/RichTextEditor";
import {
  Mail,
  Inbox,
  Send,
  FileEdit,
  Trash2,
  Star,
  RefreshCw,
  Search,
  Plus,
  Paperclip,
  ArrowLeft,
  MailOpen,
  AlertCircle,
  Loader2,
  Reply,
  Forward,
  Settings,
  FileText,
  Type,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface EmailFolder {
  id: number;
  name: string;
  type: string;
  unreadCount: number;
  totalCount: number;
  imapPath: string;
}

interface Email {
  id: number;
  subject: string;
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  date: string;
  bodyText: string;
  bodyHtml: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
}

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  bodyHtml: string;
}

const FOLDER_ICONS: Record<string, any> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileEdit,
  trash: Trash2,
  spam: AlertCircle,
  custom: Mail,
};

const FOLDER_NAMES_PT: Record<string, string> = {
  "Archive": "Arquivo",
  "Drafts": "Rascunhos",
  "Inbox": "Caixa de Entrada",
  "Newsletter": "Newsletter",
  "Notification": "Notificações",
  "Outbox": "Saída",
  "Sent": "Enviados",
  "Snoozed": "Adiados",
  "Spam": "Spam",
  "Templates": "Modelos",
  "Trash": "Lixeira",
};

const FOLDER_ORDER: Record<string, number> = {
  "Inbox": 1,
  "Sent": 2,
  "Drafts": 3,
  "Outbox": 4,
  "Archive": 5,
  "Newsletter": 6,
  "Notification": 7,
  "Snoozed": 8,
  "Spam": 9,
  "Templates": 10,
  "Trash": 11,
};

export default function EmailPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeCaseId, setComposeCaseId] = useState<string>("");
  const [composeClientId, setComposeClientId] = useState<string>("");
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [composeSigner, setComposeSigner] = useState<string>("ronald");
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const lastSyncedFolderRef = useRef<number | null>(null);

  const { data: status } = useQuery({
    queryKey: ["/api/inbox/status"],
    queryFn: async () => {
      const res = await fetch("/api/inbox/status", { headers: getAuthHeaders(), credentials: "include" });
      return res.json();
    },
  });

  const { data: folders = [], refetch: refetchFolders } = useQuery<EmailFolder[]>({
    queryKey: ["/api/inbox/folders"],
    queryFn: async () => {
      const res = await fetch("/api/inbox/folders", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: emailsList = [], isLoading: loadingEmails } = useQuery<Email[]>({
    queryKey: ["/api/inbox/folders", selectedFolderId, "emails"],
    queryFn: async () => {
      if (!selectedFolderId) return [];
      const res = await fetch(`/api/inbox/folders/${selectedFolderId}/emails`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedFolderId,
  });

  const { data: selectedEmail, isLoading: loadingEmail } = useQuery<Email>({
    queryKey: ["/api/inbox/emails", selectedEmailId],
    queryFn: async () => {
      if (!selectedEmailId) return null;
      const res = await fetch(`/api/inbox/emails/${selectedEmailId}`, { headers: getAuthHeaders(), credentials: "include" });
      return res.json();
    },
    enabled: !!selectedEmailId,
  });

  const { data: searchResults = [] } = useQuery<Email[]>({
    queryKey: ["/api/inbox/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 3) return [];
      const res = await fetch(`/api/inbox/search?q=${encodeURIComponent(searchQuery)}`, { headers: getAuthHeaders(), credentials: "include" });
      return res.json();
    },
    enabled: searchQuery.length >= 3,
  });

  const { data: signature } = useQuery<{ html: string }>({
    queryKey: ["/api/email/signature", composeSigner],
    queryFn: async () => {
      const res = await fetch(`/api/email/signature?signer=${composeSigner}`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return { html: "" };
      return res.json();
    },
  });

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email/templates"],
    queryFn: async () => {
      const res = await fetch("/api/email/templates", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: cases = [] } = useQuery<any[]>({
    queryKey: ["/api/cases"],
    queryFn: async () => {
      const res = await fetch("/api/cases", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (folders.length > 0 && !selectedFolderId) {
      const inboxFolder = folders.find(f => f.type === "inbox");
      if (inboxFolder) {
        setSelectedFolderId(inboxFolder.id);
      } else {
        setSelectedFolderId(folders[0].id);
      }
    }
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (signature) {
      setSignatureHtml(signature.html || "");
    }
  }, [signature]);

  useEffect(() => {
    if (
      selectedFolderId &&
      !loadingEmails &&
      status?.configured &&
      !isAutoSyncing &&
      lastSyncedFolderRef.current !== selectedFolderId
    ) {
      lastSyncedFolderRef.current = selectedFolderId;
      setIsAutoSyncing(true);
      fetch("/api/inbox/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ folderId: selectedFolderId }),
      })
        .then(res => res.json())
        .then(data => {
          queryClient.invalidateQueries({ queryKey: ["/api/inbox/folders", selectedFolderId, "emails"] });
          refetchFolders();
          if (data.synced > 0) {
            toast({ title: `${data.synced} e-mails sincronizados automaticamente` });
          }
        })
        .catch(() => {
          lastSyncedFolderRef.current = null;
        })
        .finally(() => setIsAutoSyncing(false));
    }
  }, [selectedFolderId, loadingEmails, status?.configured, isAutoSyncing]);

  const syncFoldersMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/inbox/sync-folders", { method: "POST", headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to sync folders");
      return res.json();
    },
    onSuccess: () => {
      refetchFolders();
      toast({ title: "Pastas sincronizadas" });
    },
    onError: () => {
      toast({ title: "Erro ao sincronizar pastas", variant: "destructive" });
    },
  });

  const syncEmailsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/inbox/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ folderId: selectedFolderId }),
      });
      if (!res.ok) throw new Error("Failed to sync emails");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/folders", selectedFolderId, "emails"] });
      refetchFolders();
      toast({ title: `${data.synced || 0} e-mails sincronizados` });
    },
    onError: () => {
      toast({ title: "Erro ao sincronizar e-mails", variant: "destructive" });
    },
  });

  const toggleStarMutation = useMutation({
    mutationFn: async (emailId: number) => {
      const res = await fetch(`/api/inbox/emails/${emailId}/star`, { method: "PATCH", headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to toggle star");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/folders", selectedFolderId, "emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/emails", selectedEmailId] });
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async (emailId: number) => {
      const res = await fetch(`/api/inbox/emails/${emailId}`, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete email");
      return res.json();
    },
    onSuccess: () => {
      setSelectedEmailId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/folders", selectedFolderId, "emails"] });
      refetchFolders();
      toast({ title: "E-mail excluído" });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      let finalHtml = composeBody;
      if (signature?.html) {
        finalHtml = finalHtml + "<br/><br/>--<br/>" + signature.html;
      }

      if (composeAttachments.length > 0) {
        const formData = new FormData();
        formData.append("to", composeTo);
        if (composeCc) formData.append("cc", composeCc);
        formData.append("subject", composeSubject);
        formData.append("html", finalHtml);
        if (composeCaseId) formData.append("caseId", composeCaseId);
        if (composeClientId) formData.append("clientId", composeClientId);
        composeAttachments.forEach((file) => {
          formData.append("attachments", file);
        });

        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { ...getAuthHeaders() },
          credentials: "include",
          body: formData,
        });
        if (!res.ok) throw new Error("Failed to send email");
        return res.json();
      }

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          to: composeTo,
          cc: composeCc || undefined,
          subject: composeSubject,
          html: finalHtml,
          caseId: composeCaseId ? Number(composeCaseId) : undefined,
          clientId: composeClientId ? Number(composeClientId) : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to send email");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        resetCompose();
        toast({ title: "E-mail enviado com sucesso!" });
        const sentFolder = (Array.isArray(folders) ? folders : []).find(f => f.name === "Sent" || f.type === "sent");
        if (sentFolder) {
          lastSyncedFolderRef.current = null;
          setTimeout(() => {
            fetch("/api/inbox/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
              credentials: "include",
              body: JSON.stringify({ folderId: sentFolder.id }),
            })
              .then(res => res.json())
              .then(() => {
                queryClient.invalidateQueries({ queryKey: ["/api/inbox/folders", sentFolder.id, "emails"] });
                refetchFolders();
              })
              .catch(() => {});
          }, 3000);
        }
      } else {
        toast({ title: data.error || "Erro ao enviar e-mail", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Erro ao enviar e-mail", variant: "destructive" });
    },
  });

  const saveSignatureMutation = useMutation({
    mutationFn: async (html: string) => {
      const res = await fetch("/api/email/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ html }),
      });
      if (!res.ok) throw new Error("Failed to save signature");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/signature"] });
      toast({ title: "Assinatura salva com sucesso!" });
      setSignatureDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar assinatura", variant: "destructive" });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; subject: string; bodyHtml: string }) => {
      const res = await fetch("/api/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      toast({ title: "Template criado com sucesso!" });
      resetTemplateForm();
    },
    onError: () => {
      toast({ title: "Erro ao criar template", variant: "destructive" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; subject: string; bodyHtml: string } }) => {
      const res = await fetch(`/api/email/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      toast({ title: "Template atualizado com sucesso!" });
      resetTemplateForm();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar template", variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/email/templates/${id}`, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      toast({ title: "Template excluído" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir template", variant: "destructive" });
    },
  });

  const refetchContentMutation = useMutation({
    mutationFn: async (emailId: number) => {
      const res = await fetch(`/api/inbox/emails/${emailId}/refetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to refetch");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/emails", selectedEmailId] });
      const sizeKb = data.sizeBytes ? (data.sizeBytes / 1024).toFixed(1) : "?";
      toast({ title: `Conteudo recarregado (${sizeKb} KB)` });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao recarregar conteudo", description: err.message, variant: "destructive" });
    },
  });

  const resetCompose = () => {
    setComposeOpen(false);
    setComposeTo("");
    setComposeCc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeCaseId("");
    setComposeClientId("");
    setComposeSigner("ronald");
    setComposeAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetTemplateForm = () => {
    setTemplateFormOpen(false);
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateSubject("");
    setTemplateBody("");
  };

  const handleReply = (email: Email) => {
    setComposeTo(email.fromAddress);
    setComposeCc("");
    setComposeSubject(email.subject?.startsWith("RE: ") ? email.subject : `RE: ${email.subject}`);
    const dateStr = format(new Date(email.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const quotedBody = `<br/><br/><p>Em ${dateStr}, ${email.fromName || email.fromAddress} escreveu:</p><blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 10px; color: #666;">${email.bodyHtml || email.bodyText?.replace(/\n/g, "<br/>") || ""}</blockquote>`;
    setComposeBody(quotedBody);
    setComposeCaseId("");
    setComposeClientId("");
    setComposeOpen(true);
  };

  const handleForward = (email: Email) => {
    setComposeTo("");
    setComposeCc("");
    setComposeSubject(email.subject?.startsWith("FW: ") ? email.subject : `FW: ${email.subject}`);
    const dateStr = format(new Date(email.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const fwdBody = `<br/><br/><p>---------- Mensagem encaminhada ----------</p><p><strong>De:</strong> ${email.fromName || ""} &lt;${email.fromAddress}&gt;</p><p><strong>Data:</strong> ${dateStr}</p><p><strong>Assunto:</strong> ${email.subject}</p><p><strong>Para:</strong> ${email.toAddresses?.join(", ") || ""}</p><br/>${email.bodyHtml || email.bodyText?.replace(/\n/g, "<br/>") || ""}`;
    setComposeBody(fwdBody);
    setComposeCaseId("");
    setComposeClientId("");
    setComposeOpen(true);
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    setComposeSubject(template.subject);
    setComposeBody(template.bodyHtml);
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateSubject(template.subject);
    setTemplateBody(template.bodyHtml);
    setTemplateFormOpen(true);
  };

  const handleSaveTemplate = () => {
    const data = { name: templateName, subject: templateSubject, bodyHtml: templateBody };
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  const displayEmails = searchQuery.length >= 3 ? searchResults : emailsList;
  const isConfigured = status?.configured;
  const isConnected = status?.connected;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-email-title">E-mail</h1>
            <p className="text-muted-foreground" data-testid="text-email-subtitle">
              Gerencie seus e-mails diretamente no LexAI
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isConfigured && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-600" data-testid="status-not-configured">
                <AlertCircle className="w-3 h-3 mr-1" />
                Não configurado
              </Badge>
            )}
            {isConfigured && !isConnected && (
              <Badge variant="outline" className="text-red-600 border-red-600" data-testid="status-disconnected">
                <AlertCircle className="w-3 h-3 mr-1" />
                Desconectado
              </Badge>
            )}
            {isConfigured && isConnected && (
              <Badge variant="outline" className="text-green-600 border-green-600" data-testid="status-connected">
                Conectado
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-1 gap-4 min-h-0">
          <Card className="w-56 flex-shrink-0 overflow-y-auto">
            <CardContent className="p-3">
              <Dialog open={composeOpen} onOpenChange={(open) => { if (!open) resetCompose(); else setComposeOpen(true); }}>
                <DialogTrigger asChild>
                  <Button className="w-full mb-4 gap-2" data-testid="button-compose">
                    <Plus className="w-4 h-4" />
                    Novo E-mail
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle data-testid="text-compose-title">Novo E-mail</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 mt-4">
                    <div>
                      <label className="text-sm font-medium">Para:</label>
                      <Input
                        placeholder="destinatario@email.com"
                        value={composeTo}
                        onChange={(e) => setComposeTo(e.target.value)}
                        data-testid="input-email-to"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Cc:</label>
                      <Input
                        placeholder="copia@email.com (opcional)"
                        value={composeCc}
                        onChange={(e) => setComposeCc(e.target.value)}
                        data-testid="input-email-cc"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Assinatura:</label>
                      <Select value={composeSigner} onValueChange={setComposeSigner}>
                        <SelectTrigger className="h-9" data-testid="select-compose-signer">
                          <SelectValue placeholder="Selecionar sócio" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ronald" data-testid="signer-option-ronald">Dr. Ronald Serra - OAB/DF 23.947</SelectItem>
                          <SelectItem value="pedro" data-testid="signer-option-pedro">Dr. Pedro Cesar N. F. Marques de Sousa - OAB/DF 57.058</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">Vincular a:</label>
                      <div className="flex gap-2 mt-1">
                        <Select value={composeCaseId} onValueChange={setComposeCaseId}>
                          <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-compose-case">
                            <SelectValue placeholder="Processo (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            {cases.map((c: any) => (
                              <SelectItem key={c.id} value={String(c.id)} data-testid={`select-case-option-${c.id}`}>
                                {c.title || c.number || `Processo #${c.id}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={composeClientId} onValueChange={setComposeClientId}>
                          <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-compose-client">
                            <SelectValue placeholder="Cliente (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            {clients.map((cl: any) => (
                              <SelectItem key={cl.id} value={String(cl.id)} data-testid={`select-client-option-${cl.id}`}>
                                {cl.name || `Cliente #${cl.id}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Assunto:</label>
                      <Input
                        placeholder="Assunto do e-mail"
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        data-testid="input-email-subject"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1" data-testid="button-templates-dropdown">
                            <FileText className="w-4 h-4" />
                            Templates
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {templates.length === 0 && (
                            <DropdownMenuItem disabled data-testid="text-no-templates">
                              Nenhum template disponível
                            </DropdownMenuItem>
                          )}
                          {templates.map((t) => (
                            <DropdownMenuItem
                              key={t.id}
                              onClick={() => handleSelectTemplate(t)}
                              data-testid={`template-option-${t.id}`}
                            >
                              <Type className="w-4 h-4 mr-2" />
                              {t.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <input
                        type="file"
                        ref={fileInputRef}
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            setComposeAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                          }
                        }}
                        data-testid="input-file-attachment"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="button-attach-file"
                      >
                        <Paperclip className="w-4 h-4" />
                        Anexar
                      </Button>
                    </div>
                    {composeAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {composeAttachments.map((file, idx) => (
                          <Badge key={idx} variant="secondary" className="gap-1 pr-1" data-testid={`attachment-chip-${idx}`}>
                            <Paperclip className="w-3 h-3" />
                            <span className="max-w-[150px] truncate text-xs">{file.name}</span>
                            <span className="text-xs text-muted-foreground ml-1">
                              ({(file.size / 1024).toFixed(0)}KB)
                            </span>
                            <button
                              onClick={() => setComposeAttachments(prev => prev.filter((_, i) => i !== idx))}
                              className="ml-1 hover:text-destructive rounded-full p-0.5"
                              data-testid={`button-remove-attachment-${idx}`}
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div>
                      <RichTextEditor
                        content={composeBody}
                        onChange={setComposeBody}
                        placeholder="Escreva sua mensagem..."
                        minHeight="180px"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={resetCompose} data-testid="button-cancel-compose">
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => sendEmailMutation.mutate()}
                        disabled={sendEmailMutation.isPending || !composeTo || !composeSubject}
                        data-testid="button-send-email"
                      >
                        {sendEmailMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4 mr-2" />
                        )}
                        Enviar
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs"
                  onClick={() => syncFoldersMutation.mutate()}
                  disabled={syncFoldersMutation.isPending || !isConfigured}
                  data-testid="button-sync-folders"
                >
                  <RefreshCw className={cn("w-3 h-3", syncFoldersMutation.isPending && "animate-spin")} />
                  Sincronizar pastas
                </Button>
              </div>

              <Separator className="my-3" />

              <div className="space-y-1">
                {(Array.isArray(folders) ? [...folders].sort((a, b) => (FOLDER_ORDER[a.name] || 99) - (FOLDER_ORDER[b.name] || 99)) : []).map((folder) => {
                  const Icon = FOLDER_ICONS[folder.type] || Mail;
                  const isActive = selectedFolderId === folder.id;
                  return (
                    <button
                      key={folder.id}
                      onClick={() => {
                        setSelectedFolderId(folder.id);
                        setSelectedEmailId(null);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                        isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                      )}
                      data-testid={`folder-${folder.id}`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 truncate">{FOLDER_NAMES_PT[folder.name] || folder.name}</span>
                      {folder.unreadCount > 0 && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          {folder.unreadCount}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>

              <Separator className="my-3" />

              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground px-2 mb-1" data-testid="text-settings-section">Configurações</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs"
                  onClick={() => setSignatureDialogOpen(true)}
                  data-testid="button-open-signature"
                >
                  <Settings className="w-3 h-3" />
                  Assinatura
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs"
                  onClick={() => setTemplatesDialogOpen(true)}
                  data-testid="button-open-templates"
                >
                  <FileText className="w-3 h-3" />
                  Modelos
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col min-w-0">
            <CardHeader className="py-3 px-4 border-b flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar e-mails..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-email"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncEmailsMutation.mutate()}
                  disabled={syncEmailsMutation.isPending || !selectedFolderId || !isConfigured}
                  data-testid="button-sync-emails"
                >
                  <RefreshCw className={cn("w-4 h-4", syncEmailsMutation.isPending && "animate-spin")} />
                </Button>
              </div>
            </CardHeader>
            <div className="flex flex-1 min-h-0">
              <ScrollArea className="w-80 border-r flex-shrink-0">
                <div className="divide-y">
                  {loadingEmails && (
                    <div className="p-4 text-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Carregando...
                    </div>
                  )}
                  {isAutoSyncing && (
                    <div className="p-8 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm">Sincronizando e-mails do Zoho...</p>
                    </div>
                  )}
                  {!loadingEmails && !isAutoSyncing && displayEmails.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground">
                      {!isConfigured ? (
                        <div>
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                          <p className="text-sm">Configure as credenciais do Zoho Mail para começar</p>
                        </div>
                      ) : (
                        <p className="text-sm" data-testid="text-no-emails">Nenhum e-mail encontrado. Clique em sincronizar.</p>
                      )}
                    </div>
                  )}
                  {displayEmails.map((email) => (
                    <button
                      key={email.id}
                      onClick={() => setSelectedEmailId(email.id)}
                      className={cn(
                        "w-full p-3 text-left transition-colors",
                        selectedEmailId === email.id ? "bg-primary/5" : "hover:bg-muted/50",
                        !email.isRead && "bg-blue-50/50"
                      )}
                      data-testid={`email-item-${email.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStarMutation.mutate(email.id);
                          }}
                          className="flex-shrink-0 mt-0.5"
                          data-testid={`button-star-${email.id}`}
                        >
                          <Star
                            className={cn(
                              "w-4 h-4",
                              email.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                            )}
                          />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm truncate", !email.isRead && "font-semibold")}>
                              {email.fromName || email.fromAddress}
                            </span>
                            {email.hasAttachments && (
                              <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                          <p className={cn("text-sm truncate", !email.isRead ? "font-medium" : "text-muted-foreground")}>
                            {email.subject || "(Sem assunto)"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {email.bodyText?.substring(0, 60)}...
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {format(new Date(email.date), "dd/MM", { locale: ptBR })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex-1 min-w-0">
                {!selectedEmailId && (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <MailOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p data-testid="text-select-email">Selecione um e-mail para visualizar</p>
                    </div>
                  </div>
                )}
                {selectedEmailId && loadingEmail && (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
                {selectedEmailId && selectedEmail && !loadingEmail && (
                  <div className="h-full flex flex-col">
                    <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEmailId(null)}
                          className="md:hidden"
                          data-testid="button-back-email"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <h3 className="font-semibold truncate" data-testid="text-email-subject">{selectedEmail.subject || "(Sem assunto)"}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReply(selectedEmail)}
                          data-testid="button-reply"
                          title="Responder"
                        >
                          <Reply className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleForward(selectedEmail)}
                          data-testid="button-forward"
                          title="Encaminhar"
                        >
                          <Forward className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleStarMutation.mutate(selectedEmail.id)}
                          data-testid="button-star-selected"
                        >
                          <Star
                            className={cn(
                              "w-4 h-4",
                              selectedEmail.isStarred ? "fill-yellow-400 text-yellow-400" : ""
                            )}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => refetchContentMutation.mutate(selectedEmail.id)}
                          disabled={refetchContentMutation.isPending}
                          title="Recarregar conteudo completo do Zoho"
                          data-testid="button-refetch-email"
                        >
                          {refetchContentMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteEmailMutation.mutate(selectedEmail.id)}
                          data-testid="button-delete-email"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-4 border-b flex-shrink-0">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                          {(selectedEmail.fromName || selectedEmail.fromAddress || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium" data-testid="text-email-from-name">{selectedEmail.fromName || selectedEmail.fromAddress}</p>
                          <p className="text-sm text-muted-foreground" data-testid="text-email-from-address">{selectedEmail.fromAddress}</p>
                          <p className="text-xs text-muted-foreground mt-1" data-testid="text-email-to">
                            Para: {selectedEmail.toAddresses?.join(", ") || "-"}
                          </p>
                        </div>
                        <span className="text-sm text-muted-foreground flex-shrink-0" data-testid="text-email-date">
                          {format(new Date(selectedEmail.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                    <ScrollArea className="flex-1 p-4">
                      {selectedEmail.bodyHtml ? (
                        <div
                          className="prose prose-sm max-w-none"
                          data-testid="text-email-body-html"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedEmail.bodyHtml, {
                            ALLOWED_TAGS: ['html', 'head', 'body', 'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'span', 'div', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img', 'font', 'center', 'small', 'big', 'sub', 'sup', 'hr', 'caption', 'col', 'colgroup', 'style', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'figure', 'figcaption', 'mark', 'del', 'ins', 's', 'strike', 'abbr', 'address', 'cite', 'dfn', 'dl', 'dt', 'dd', 'details', 'summary', 'label', 'legend', 'fieldset', 'map', 'area', 'wbr', 'nobr'],
                            ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'align', 'valign', 'bgcolor', 'color', 'size', 'face', 'colspan', 'rowspan', 'scope', 'title', 'dir', 'lang', 'role', 'name', 'id', 'type', 'value', 'start', 'reversed', 'shape', 'coords', 'usemap'],
                            ALLOW_DATA_ATTR: false,
                          }) }}
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap text-sm font-sans" data-testid="text-email-body-text">{selectedEmail.bodyText}</pre>
                      )}
                    </ScrollArea>
                    <div className="p-3 border-t flex gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleReply(selectedEmail)}
                        data-testid="button-reply-bottom"
                      >
                        <Reply className="w-4 h-4" />
                        Responder
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleForward(selectedEmail)}
                        data-testid="button-forward-bottom"
                      >
                        <Forward className="w-4 h-4" />
                        Encaminhar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle data-testid="text-signature-title">Assinatura de E-mail</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <RichTextEditor
              content={signatureHtml}
              onChange={setSignatureHtml}
              placeholder="Digite sua assinatura de e-mail..."
              minHeight="150px"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSignatureDialogOpen(false)} data-testid="button-cancel-signature">
                Cancelar
              </Button>
              <Button
                onClick={() => saveSignatureMutation.mutate(signatureHtml)}
                disabled={saveSignatureMutation.isPending}
                data-testid="button-save-signature"
              >
                {saveSignatureMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templatesDialogOpen} onOpenChange={setTemplatesDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-templates-title">Gerenciar Templates</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                className="gap-1"
                onClick={() => {
                  resetTemplateForm();
                  setTemplateFormOpen(true);
                }}
                data-testid="button-new-template"
              >
                <Plus className="w-4 h-4" />
                Novo Template
              </Button>
            </div>
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-templates-manage">
                Nenhum template criado ainda.
              </p>
            )}
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 border rounded" data-testid={`template-item-${t.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditTemplate(t)}
                      data-testid={`button-edit-template-${t.id}`}
                    >
                      <FileEdit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTemplateMutation.mutate(t.id)}
                      data-testid={`button-delete-template-${t.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templateFormOpen} onOpenChange={(open) => { if (!open) resetTemplateForm(); else setTemplateFormOpen(true); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-template-form-title">
              {editingTemplate ? "Editar Template" : "Novo Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Nome:</label>
              <Input
                placeholder="Nome do template"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                data-testid="input-template-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Assunto:</label>
              <Input
                placeholder="Assunto do e-mail"
                value={templateSubject}
                onChange={(e) => setTemplateSubject(e.target.value)}
                data-testid="input-template-subject"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Corpo:</label>
              <RichTextEditor
                content={templateBody}
                onChange={setTemplateBody}
                placeholder="Corpo do template... Use {{variavel}} para placeholders"
                minHeight="180px"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetTemplateForm} data-testid="button-cancel-template">
                Cancelar
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={!templateName || !templateSubject || createTemplateMutation.isPending || updateTemplateMutation.isPending}
                data-testid="button-save-template"
              >
                {(createTemplateMutation.isPending || updateTemplateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
