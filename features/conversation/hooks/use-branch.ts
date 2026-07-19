"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createBranch, listBranches } from "@/features/conversation/actions/branch-actions";
import { queryKeys } from "../utils/query-keys";

/** Fetches the parent (if any) and direct branches of a conversation. */
export function useBranches(conversationId: string) {
    return useQuery({
        queryKey: queryKeys.conversations.branches(conversationId),
        queryFn: () => listBranches(conversationId),
    });
}

/**
 * Forks a conversation at a given message and navigates to the new branch.
 */
export function useCreateBranch() {
    const queryClient = useQueryClient();
    const router = useRouter();

    return useMutation({
        mutationFn: ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
            createBranch(conversationId, messageId),
        onSuccess: (branch, variables) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.all,
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.branches(variables.conversationId),
            });
            router.push(`/c/${branch.id}`);
        },
        onError: (error: Error) => {
            toast.error(error.message || "Could not create branch");
        },
    });
}
