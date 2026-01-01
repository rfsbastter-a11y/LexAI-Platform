import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Sparkles, FileText, Paperclip, Loader2, Quote, AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAiChat } from "@/hooks/use-ai";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ source: string; excerpt: string; relevance: string }>;
  timestamp: string;
}

export default function StudioPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Olá! Eu sou a LexAI, sua assistente jurídica. Posso ajudar a analisar documentos, redigir peças ou pesquisar legislação. Por onde gostaria de começar?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const aiChat = useAiChat();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || aiChat.isPending) return;

    const userMessage: Message = {
      role: "user",
      content: inputValue,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue("");

    try {
      const chatHistory = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await aiChat.mutateAsync({ messages: chatHistory });

      const assistantMessage: Message = {
        role: "assistant",
        content: response.content,
        citations: response.citations,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error in AI chat:", error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex gap-4">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-card/50 backdrop-blur flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-900/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-serif font-semibold">LexAI Assistant</h2>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Online • GPT-4o
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="hidden sm:flex">
              <FileText className="w-4 h-4 mr-2" />
              Novo Contexto
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-6 max-w-3xl mx-auto">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === 'assistant' ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-600'}`}>
                    {msg.role === 'assistant' ? <Bot className="w-5 h-5" /> : <span className="font-bold text-xs">EU</span>}
                  </div>
                  <div className={`space-y-2 max-w-[80%]`}>
                    <div className={`p-4 rounded-2xl ${msg.role === 'assistant' ? 'bg-secondary text-secondary-foreground rounded-tl-none' : 'bg-primary text-primary-foreground rounded-tr-none'}`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="space-y-2 mt-2">
                        {msg.citations.map((cit, idx) => (
                          <div key={idx} className="text-xs bg-muted/50 p-3 rounded border border-border/50 flex gap-3">
                            <Quote className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <div>
                              <p className="font-bold text-primary">{cit.source} <span className="font-normal text-muted-foreground">• {cit.relevance}</span></p>
                              <p className="text-muted-foreground italic mt-1">"{cit.excerpt}"</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground block px-1">{msg.timestamp}</span>
                  </div>
                </div>
              ))}
              {aiChat.isPending && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="bg-secondary p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Analisando e processando...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t bg-background/50">
            <div className="max-w-3xl mx-auto relative">
              <Textarea 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Descreva o caso, peça um resumo ou solicite uma minuta..."
                className="min-h-[80px] resize-none pr-20 pl-4 py-3 bg-background shadow-sm border-muted-foreground/20 focus:border-primary"
                disabled={aiChat.isPending}
              />
              <div className="absolute right-2 bottom-2 flex gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Button 
                  size="icon" 
                  className="h-8 w-8 bg-primary hover:bg-primary/90" 
                  onClick={handleSend} 
                  disabled={!inputValue.trim() || aiChat.isPending}
                >
                  {aiChat.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-2 flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              A LexAI pode cometer erros. Verifique sempre as fontes citadas. Toda produção requer validação humana.
            </p>
          </div>
        </div>

        {/* Sidebar Context */}
        <div className="w-80 hidden xl:flex flex-col gap-4">
          <Card className="flex-1 bg-muted/10 border-dashed">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 opacity-50" />
              </div>
              <h3 className="font-medium text-foreground mb-1">Contexto do Caso</h3>
              <p className="text-xs mb-4">Arraste arquivos PDF/DOCX aqui para análise cruzada.</p>
              <Button variant="outline" size="sm" className="w-full">Upload de Arquivos</Button>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4">
              <h4 className="font-medium text-amber-800 text-sm mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Regras da LexAI
              </h4>
              <ul className="text-xs text-amber-700 space-y-1">
                <li>• Não inventa jurisprudência</li>
                <li>• Não simula dados ou fatos</li>
                <li>• Toda citação tem fonte</li>
                <li>• Requer validação humana</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
