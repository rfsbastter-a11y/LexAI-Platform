import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contractsApi } from "@/lib/api";

export function useContracts() {
  return useQuery({
    queryKey: ["contracts"],
    queryFn: contractsApi.getAll,
  });
}

export function useCreateContract() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: contractsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
  });
}
