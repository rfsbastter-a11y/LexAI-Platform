import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { casesApi, datajudApi } from "@/lib/api";

export function useCases() {
  return useQuery({
    queryKey: ["cases"],
    queryFn: casesApi.getAll,
  });
}

export function useCase(id: number) {
  return useQuery({
    queryKey: ["cases", id],
    queryFn: () => casesApi.getById(id),
    enabled: !!id,
  });
}

export function useCaseMovements(caseId: number) {
  return useQuery({
    queryKey: ["cases", caseId, "movements"],
    queryFn: () => casesApi.getMovements(caseId),
    enabled: !!caseId,
  });
}

export function useCreateCase() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: casesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function useDatajudSearch() {
  return useMutation({
    mutationFn: datajudApi.search,
  });
}

export function useDatajudImport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: datajudApi.import,
    onSuccess: (_, caseId) => {
      queryClient.invalidateQueries({ queryKey: ["cases", caseId, "movements"] });
      queryClient.invalidateQueries({ queryKey: ["cases", caseId] });
    },
  });
}
