import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, X, Send, Loader2, Sparkles, UserPlus, FileText, BarChart3, Scale, Minimize2, Maximize2, CheckCircle2 } from "lucide-react";
import { useAiChat } from "@/hooks/use-ai";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi, casesApi, aiApi } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  action?: {
    type: string;
    label: string;
    route?: string;
  };
}

const QUICK_ACTIONS = [
  { icon: UserPlus, label: "Cadastrar Cliente", prompt: "Quero cadastrar um novo cliente", action: "register_client" },
  { icon: Scale, label: "Novo Processo", prompt: "Preciso cadastrar um novo processo", action: "new_case" },
  { icon: FileText, label: "Gerar Peça", prompt: "Preciso gerar uma peça processual", action: "generate_piece" },
  { icon: BarChart3, label: "Relatório", prompt: "Gere um relatório de desempenho", action: "generate_report" },
];

export function FloatingAI() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [awaitingInput, setAwaitingInput] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<any>({});
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Olá! Sou sua assistente executiva. Posso cadastrar clientes, gerar relatórios, criar peças processuais ou navegar pelo sistema. Como posso ajudar?",
    }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aiChat = useAiChat();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const createClient = useMutation({
    mutationFn: clientsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  const createCase = useMutation({
    mutationFn: casesApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cases"] }),
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleQuickAction = async (action: typeof QUICK_ACTIONS[0]) => {
    setMessages(prev => [...prev, { role: "user", content: action.prompt }]);
    
    if (action.action === "register_client") {
      setAwaitingInput("client_name");
      setPendingData({});
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Vou cadastrar um novo cliente agora. Por favor, informe o nome completo ou razão social:" 
      }]);
    } else if (action.action === "new_case") {
      setAwaitingInput("case_number");
      setPendingData({});
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Vou cadastrar um novo processo. Por favor, informe o número do processo (formato CNJ):" 
      }]);
    } else if (action.action === "generate_piece") {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Para gerar uma peça processual, preciso de algumas informações:\n\n1. Qual o tipo de peça? (Manifestação, Contestação, Recurso...)\n2. Sobre qual intimação ou decisão?\n\nOu você pode ir diretamente ao Estúdio para mais opções.",
        action: { type: "navigate", label: "Ir para Estúdio", route: "/studio" }
      }]);
    } else if (action.action === "generate_report") {
      setMessages(prev => [...prev, { role: "assistant", content: "Gerando relatório executivo..." }]);
      
      try {
        const response = await aiChat.mutateAsync({
          messages: [{ role: "user", content: "Gere um breve relatório executivo de desempenho para um escritório de advocacia, incluindo métricas típicas como processos ativos, prazos, faturamento e produtividade. Use dados hipotéticos realistas." }]
        });
        
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "📊 **Relatório Executivo Gerado**\n\n" + response.content.substring(0, 800) + "...\n\nPara visualizar relatórios completos e personalizados, acesse a área de Relatórios.",
          action: { type: "navigate", label: "Ver Relatórios", route: "/reports" }
        }]);
      } catch (error) {
        setMessages(prev => [...prev, { role: "assistant", content: "Não foi possível gerar o relatório. Tente novamente." }]);
      }
    }
  };

  const processAwaitingInput = async (input: string) => {
    if (awaitingInput === "client_name") {
      setPendingData({ ...pendingData, name: input });
      setAwaitingInput("client_document");
      setMessages(prev => [...prev, { role: "assistant", content: `Nome: ${input}\n\nAgora informe o CPF ou CNPJ:` }]);
    } else if (awaitingInput === "client_document") {
      const clientData = {
        name: pendingData.name,
        document: input,
        type: input.replace(/\D/g, "").length > 11 ? "PJ" : "PF",
        status: "ativo",
      };
      
      setMessages(prev => [...prev, { role: "assistant", content: "Cadastrando cliente..." }]);
      
      try {
        await createClient.mutateAsync(clientData);
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `✅ Cliente "${clientData.name}" cadastrado com sucesso!\n\nDocumento: ${clientData.document}\nTipo: ${clientData.type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}`,
          action: { type: "navigate", label: "Ver Clientes", route: "/clients" }
        }]);
      } catch (error) {
        setMessages(prev => [...prev, { role: "assistant", content: "Erro ao cadastrar cliente. Verifique os dados e tente novamente." }]);
      }
      
      setAwaitingInput(null);
      setPendingData({});
    } else if (awaitingInput === "case_number") {
      setPendingData({ ...pendingData, caseNumber: input });
      setAwaitingInput("case_title");
      setMessages(prev => [...prev, { role: "assistant", content: `Número: ${input}\n\nInforme um título breve para o processo:` }]);
    } else if (awaitingInput === "case_title") {
      setPendingData({ ...pendingData, title: input });
      setAwaitingInput("case_court");
      setMessages(prev => [...prev, { role: "assistant", content: `Título: ${input}\n\nQual é a vara/tribunal?` }]);
    } else if (awaitingInput === "case_court") {
      const caseData = {
        caseNumber: pendingData.caseNumber,
        title: pendingData.title,
        court: input,
        caseType: "civil",
        clientId: 1,
        status: "ativo",
      };
      
      setMessages(prev => [...prev, { role: "assistant", content: "Cadastrando processo..." }]);
      
      try {
        await createCase.mutateAsync(caseData);
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `✅ Processo cadastrado com sucesso!\n\nNúmero: ${caseData.caseNumber}\nTítulo: ${caseData.title}\nVara: ${caseData.court}`,
          action: { type: "navigate", label: "Ver Processos", route: "/cases" }
        }]);
      } catch (error) {
        setMessages(prev => [...prev, { role: "assistant", content: "Erro ao cadastrar processo. Verifique os dados e tente novamente." }]);
      }
      
      setAwaitingInput(null);
      setPendingData({});
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || aiChat.isPending) return;

    const userMessage = inputValue.trim();
    const lowerMessage = userMessage.toLowerCase();
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInputValue("");

    // Handle awaiting input for multi-step flows
    if (awaitingInput) {
      await processAwaitingInput(userMessage);
      return;
    }

    // Check for executive commands
    if (lowerMessage.includes("cadastrar cliente") || lowerMessage.includes("novo cliente")) {
      setAwaitingInput("client_name");
      setPendingData({});
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Vou cadastrar um novo cliente agora. Por favor, informe o nome completo ou razão social:"
      }]);
      return;
    }

    if (lowerMessage.includes("novo processo") || lowerMessage.includes("cadastrar processo")) {
      setAwaitingInput("case_number");
      setPendingData({});
      setMessages(prev => [...prev, {
        role: "assistant", 
        content: "Vou cadastrar um novo processo. Por favor, informe o número do processo (formato CNJ):"
      }]);
      return;
    }

    if (lowerMessage.includes("relatório") || lowerMessage.includes("relatorio")) {
      handleQuickAction(QUICK_ACTIONS[3]);
      return;
    }

    if (lowerMessage.includes("peça") || lowerMessage.includes("peca") || lowerMessage.includes("petição")) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Para gerar peças processuais completas, acesse o LexAI Studio ou vá para um processo específico e clique em 'Gerar Peça com IA' nas movimentações.",
        action: { type: "navigate", label: "Ir para Estúdio", route: "/studio" }
      }]);
      return;
    }

    // Default AI response
    try {
      const response = await aiChat.mutateAsync({ 
        messages: [
          { role: "user", content: `Você é a LexAI, assistente executiva de um escritório de advocacia brasileiro. O usuário pediu: "${userMessage}". Responda de forma breve e prática em português. Se for uma ação executiva (cadastrar, gerar, criar), indique que pode fazer isso pelo chat.` }
        ] 
      });
      
      setMessages(prev => [...prev, { role: "assistant", content: response.content }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Desculpe, não consegui processar sua solicitação. Tente novamente ou use os atalhos rápidos." 
      }]);
    }
  };

  const handleNavigate = (route: string) => {
    navigate(route);
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg shadow-primary/30 hover:scale-110 transition-transform"
        size="icon"
        data-testid="floating-ai-button"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className={`fixed z-50 shadow-2xl transition-all duration-300 ${
      isMinimized 
        ? "bottom-6 right-6 w-72 h-14" 
        : "bottom-6 right-6 w-96 h-[500px] max-h-[80vh]"
    }`}>
      <CardHeader className="p-3 border-b flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-medium">Assistente LexAI</CardTitle>
            {!isMinimized && <p className="text-[10px] text-muted-foreground">Funções Executivas</p>}
          </div>
        </div>
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {!isMinimized && (
        <CardContent className="p-0 flex flex-col h-[calc(100%-56px)]">
          {/* Quick Actions */}
          <div className="p-3 border-b bg-muted/30">
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-medium">Ações Rápidas</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((action, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs justify-start gap-2 hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => handleQuickAction(action)}
                  data-testid={`quick-action-${action.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <action.icon className="w-3 h-3" />
                  {action.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-3" ref={scrollRef}>
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
                      <Bot className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] space-y-2`}>
                    <div className={`p-2 rounded-lg text-xs ${
                      msg.role === 'assistant' 
                        ? 'bg-muted text-foreground' 
                        : 'bg-primary text-primary-foreground'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.action && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs w-full"
                        onClick={() => handleNavigate(msg.action!.route!)}
                      >
                        {msg.action.label}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {aiChat.isPending && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
                    <Loader2 className="w-3 h-3 text-primary animate-spin" />
                  </div>
                  <div className="bg-muted p-2 rounded-lg text-xs text-muted-foreground">
                    Processando...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Digite um comando ou pergunta..."
                className="h-8 text-xs"
                disabled={aiChat.isPending}
                data-testid="floating-ai-input"
              />
              <Button 
                size="icon" 
                className="h-8 w-8 flex-shrink-0" 
                onClick={handleSend}
                disabled={!inputValue.trim() || aiChat.isPending}
                data-testid="floating-ai-send"
              >
                <Send className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
