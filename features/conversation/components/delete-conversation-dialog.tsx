"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteConversation } from "@/features/conversation/hooks/use-conversation";

/** Confirmation dialog for permanently deleting a conversation (or branch). */
export function DeleteConversationDialog({
    open,
    onOpenChange,
    conversationId,
    isActive,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId: string;
    isActive: boolean;
}) {
    const deleteConversation = useDeleteConversation(
        isActive ? conversationId : undefined
    );

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This permanently deletes this chat and its messages. Any
                        branches created from it will be kept but no longer linked to
                        it.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={deleteConversation.isPending}
                        onClick={() => {
                            deleteConversation.mutate(conversationId, {
                                onSuccess: () => onOpenChange(false),
                            });
                        }}
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
