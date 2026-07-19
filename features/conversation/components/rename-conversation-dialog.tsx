"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUpdateConversation } from "@/features/conversation/hooks/use-conversation";

/** Dialog for renaming a conversation (or branch, since a branch is a conversation). */
export function RenameConversationDialog({
    open,
    onOpenChange,
    conversationId,
    currentTitle,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId: string;
    currentTitle: string;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                {/* Keyed by `open` so the form's local state re-initializes from
                    `currentTitle` on every open, without syncing via an effect. */}
                <RenameForm
                    key={String(open)}
                    conversationId={conversationId}
                    currentTitle={currentTitle}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    );
}

function RenameForm({
    conversationId,
    currentTitle,
    onOpenChange,
}: {
    conversationId: string;
    currentTitle: string;
    onOpenChange: (open: boolean) => void;
}) {
    const [title, setTitle] = useState(currentTitle);
    const updateConversation = useUpdateConversation();

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        const trimmed = title.trim();
        if (!trimmed || trimmed === currentTitle) {
            onOpenChange(false);
            return;
        }
        updateConversation.mutate(
            { id: conversationId, title: trimmed },
            { onSuccess: () => onOpenChange(false) }
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <DialogHeader>
                <DialogTitle>Rename chat</DialogTitle>
            </DialogHeader>
            <Input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Chat title"
            />
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                </Button>
                <Button type="submit" disabled={updateConversation.isPending}>
                    Save
                </Button>
            </DialogFooter>
        </form>
    );
}
