import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
  ChevronRight,
  Loader2,
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

interface EmailDraft {
  id: number;
  toAddresses: string[];
  subject: string;
  bodyHtml: string;
  updatedAt: string;
}

const FOLDER_ICONS: Record<string, any> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileEdit,
  trash: Trash2,
  custom: Mail,
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

  const { data: status } = useQuery({
    queryKey: ["/api/inbox/status"],
    queryFn: async () => {
      const res = await fetch("/api/inbox/status");
      return res.json();
    },
  });

  const { data: folders = [], refetch: refetchFolders } = useQuery<EmailFolder[]>({
    queryKey: ["/api/inbox/folders"],
    queryFn: async () => {
      const res = await fetch("/api/inbox/folders");
      return res.json();
    },
  });

  const { data: emailsList = [], isLoading: loadingEmails } = useQuery<Email[]>({
    queryKey: ["/api/inbox/folders", selectedFolderId, "emails"],
    queryFn: async () => {
      if (!selectedFolderId) return [];
      const res = await fetch(`/api/inbox/folders/${selectedFolderId}/emails`);
      return res.json();
    },
    enabled: !!selectedFolderId,
  });

  const { data: selectedEmail, isLoading: loadingEmail } = useQuery<Email>({
    queryKey: ["/api/inbox/emails", selectedEmailId],
    queryFn: async () => {
      if (!selectedEmailId) return null;
      const res = await fetch(`/api/inbox/emails/${selectedEmailId}`);
      return res.json();
    },
    enabled: !!selectedEmailId,
  });

  const { data: searchResults = [] } = useQuery<Email[]>({
    queryKey: ["/api/inbox/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 3) return [];
      const res = await fetch(`/api/inbox/search?q=${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: searchQuery.length >= 3,
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

  const syncFoldersMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/inbox/sync-folders", { method: "POST" });
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
        headers: { "Content-Type": "application/json" },
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
      const res = await fetch(`/api/inbox/emails/${emailId}/star`, { method: "PATCH" });
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
      const res = await fetch(`/api/inbox/emails/${emailId}`, { method: "DELETE" });
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
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          cc: composeCc || undefined,
          subject: composeSubject,
          html: composeBody.replace(/\n/g, "<br>"),
        }),
      });
      if (!res.ok) throw new Error("Failed to send email");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setComposeOpen(false);
        setComposeTo("");
        setComposeCc("");
        setComposeSubject("");
        setComposeBody("");
        toast({ title: "E-mail enviado com sucesso!" });
      } else {
        toast({ title: data.error || "Erro ao enviar e-mail", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Erro ao enviar e-mail", variant: "destructive" });
    },
  });

  const displayEmails = searchQuery.length >= 3 ? searchResults : emailsList;

  const isConfigured = status?.configured;
  const isConnected = status?.connected;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">E-mail</h1>
            <p className="text-muted-foreground">
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
          <Card className="w-56 flex-shrink-0">
            <CardContent className="p-3">
              <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full mb-4 gap-2" data-testid="button-compose">
                    <Plus className="w-4 h-4" />
                    Novo E-mail
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Novo E-mail</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
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
                      <label className="text-sm font-medium">Assunto:</label>
                      <Input
                        placeholder="Assunto do e-mail"
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        data-testid="input-email-subject"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Mensagem:</label>
                      <Textarea
                        placeholder="Escreva sua mensagem..."
                        rows={10}
                        value={composeBody}
                        onChange={(e) => setComposeBody(e.target.value)}
                        data-testid="textarea-email-body"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setComposeOpen(false)}>
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

              <ScrollArea className="h-64">
                <div className="space-y-1">
                  {folders.map((folder) => {
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
                        <span className="flex-1 truncate">{folder.name}</span>
                        {folder.unreadCount > 0 && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {folder.unreadCount}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
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
                  {!loadingEmails && displayEmails.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground">
                      {!isConfigured ? (
                        <div>
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                          <p className="text-sm">Configure as credenciais do Zoho Mail para começar</p>
                        </div>
                      ) : (
                        <p className="text-sm">Nenhum e-mail encontrado</p>
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
                      <p>Selecione um e-mail para visualizar</p>
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
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <h3 className="font-semibold truncate">{selectedEmail.subject || "(Sem assunto)"}</h3>
                      </div>
                      <div className="flex items-center gap-1">
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
                          <p className="font-medium">{selectedEmail.fromName || selectedEmail.fromAddress}</p>
                          <p className="text-sm text-muted-foreground">{selectedEmail.fromAddress}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Para: {selectedEmail.toAddresses?.join(", ") || "-"}
                          </p>
                        </div>
                        <span className="text-sm text-muted-foreground flex-shrink-0">
                          {format(new Date(selectedEmail.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                    <ScrollArea className="flex-1 p-4">
                      {selectedEmail.bodyHtml ? (
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap text-sm font-sans">{selectedEmail.bodyText}</pre>
                      )}
                    </ScrollArea>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
