import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Sparkles, FileText, Paperclip, ChevronRight, Loader2, Quote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export default function StudioPage() {
  const [messages, setMessages] = useState<any[]>([
    {
      role: "assistant",
      content: "Olá, Dra. Roberta. Eu sou a LexAI. Posso ajudar a analisar documentos, redigir peças ou pesquisar jurisprudência. Por onde gostaria de começar hoje?",
      timestamp: "10:30"
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const newMsg = {
      role: "user",
      content: inputValue,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages([...messages, newMsg]);
    setInputValue("");
    setIsProcessing(true);

    // Mock AI Response
    setTimeout(() => {
      setIsProcessing(false);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Compreendo. Estou analisando a petição inicial enviada. Identifiquei 3 teses principais de defesa com base na jurisprudência recente do STJ. Gostaria que eu redigisse o esboço da contestação?",
        citations: [
          { title: "REsp 1.234.567/MG", source: "STJ", text: "A cobrança de taxa de conveniência em vendas online..." },
          { title: "Art. 42, Parágrafo Único", source: "CDC", text: "O consumidor cobrado em quantia indevida tem direito à repetição do indébito..." }
        ],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }, 2000);
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
                  Online • GPT-4o Connected
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="hidden sm:flex">
              <FileText className="w-4 h-4 mr-2" />
              Novo Contexto
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6 max-w-3xl mx-auto">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === 'assistant' ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-600'}`}>
                    {msg.role === 'assistant' ? <Bot className="w-5 h-5" /> : <span className="font-bold text-xs">EU</span>}
                  </div>
                  <div className={`space-y-2 max-w-[80%]`}>
                    <div className={`p-4 rounded-2xl ${msg.role === 'assistant' ? 'bg-secondary text-secondary-foreground rounded-tl-none' : 'bg-primary text-primary-foreground rounded-tr-none'}`}>
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </div>
                    {msg.citations && (
                      <div className="space-y-2 mt-2">
                        {msg.citations.map((cit: any, idx: number) => (
                          <div key={idx} className="text-xs bg-muted/50 p-3 rounded border border-border/50 flex gap-3">
                            <Quote className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <div>
                              <p className="font-bold text-primary">{cit.title} <span className="font-normal text-muted-foreground">• {cit.source}</span></p>
                              <p className="text-muted-foreground italic mt-1">"{cit.text}"</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground block px-1">{msg.timestamp}</span>
                  </div>
                </div>
              ))}
              {isProcessing && (
                 <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 flex items-center justify-center">
                       <Bot className="w-5 h-5" />
                    </div>
                    <div className="bg-secondary p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Analisando documentos e jurisprudência...</span>
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
                placeholder="Descreva o caso, peça um resumo ou solicite uma minuta..."
                className="min-h-[80px] resize-none pr-20 pl-4 py-3 bg-background shadow-sm border-muted-foreground/20 focus:border-primary"
              />
              <div className="absolute right-2 bottom-2 flex gap-2">
                 <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <Paperclip className="w-4 h-4" />
                 </Button>
                 <Button size="icon" className="h-8 w-8 bg-primary hover:bg-primary/90" onClick={handleSend} disabled={!inputValue.trim() || isProcessing}>
                    <Send className="w-4 h-4" />
                 </Button>
              </div>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-2">
              A LexAI pode cometer erros. Verifique sempre as fontes citadas. Informações confidenciais são protegidas.
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
        </div>
      </div>
    </DashboardLayout>
  );
}
