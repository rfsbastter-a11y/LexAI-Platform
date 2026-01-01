import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi } from "@/lib/api";

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: clientsApi.getAll,
  });
}

export function useClient(id: number) {
  return useQuery({
    queryKey: ["clients", id],
    queryFn: () => clientsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: clientsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
