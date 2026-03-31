import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { casesApi } from "@/lib/api";

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

export function useUpdateCase() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => casesApi.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["cases", variables.id] });
    },
  });
}
