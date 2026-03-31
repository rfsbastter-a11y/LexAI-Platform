import { useMutation } from "@tanstack/react-query";
import { aiApi } from "@/lib/api";

export function useAiChat() {
  return useMutation({
    mutationFn: ({ messages, contextDocuments }: { 
      messages: Array<{ role: string; content: string }>;
      contextDocuments?: any[];
    }) => aiApi.chat(messages, contextDocuments),
  });
}

export function useGeneratePiece() {
  return useMutation({
    mutationFn: aiApi.generatePiece,
  });
}

export function useSummarizeDocument() {
  return useMutation({
    mutationFn: ({ content, title }: { content: string; title: string }) =>
      aiApi.summarize(content, title),
  });
}

export function useAnalyzeIntimacao() {
  return useMutation({
    mutationFn: aiApi.analyzeIntimacao,
  });
}

export function useExtractData() {
  return useMutation({
    mutationFn: ({ content, type }: { content: string; type: "contract" | "procuration" | "petition" }) =>
      aiApi.extract(content, type),
  });
}
