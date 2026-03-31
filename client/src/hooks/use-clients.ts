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

export function useClientContracts(clientId: number) {
  return useQuery({
    queryKey: ["clients", clientId, "contracts"],
    queryFn: () => clientsApi.getContracts(clientId),
    enabled: !!clientId,
  });
}

export function useClientCases(clientId: number) {
  return useQuery({
    queryKey: ["clients", clientId, "cases"],
    queryFn: () => clientsApi.getCases(clientId),
    enabled: !!clientId,
  });
}

export function useClientInvoices(clientId: number) {
  return useQuery({
    queryKey: ["clients", clientId, "invoices"],
    queryFn: () => clientsApi.getInvoices(clientId),
    enabled: !!clientId,
  });
}

export function useClientDeadlines(clientId: number) {
  return useQuery({
    queryKey: ["clients", clientId, "deadlines"],
    queryFn: () => clientsApi.getDeadlines(clientId),
    enabled: !!clientId,
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

export function useUpdateClient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => clientsApi.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients", variables.id] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => clientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
