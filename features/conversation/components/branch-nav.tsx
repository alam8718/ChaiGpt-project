"use client";

import Link from "next/link";
import { ChevronDownIcon, CornerUpLeftIcon, GitBranchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBranches } from "@/features/conversation/hooks/use-branch";

/**
 * In-context header navigator: links back to the parent conversation this
 * branch forked from, and lists any branches forked from this conversation.
 */
export function BranchNav({ conversationId }: { conversationId: string }) {
    const { data } = useBranches(conversationId);

    if (!data || (!data.parent && data.branches.length === 0)) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            {data.parent ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    render={<Link href={`/c/${data.parent.id}`} />}
                >
                    <CornerUpLeftIcon />
                    <span className="max-w-40 truncate">
                        Forked from {data.parent.title}
                    </span>
                </Button>
            ) : null}

            {data.branches.length > 0 ? (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button variant="ghost" size="sm" className="text-muted-foreground" />
                        }
                    >
                        <GitBranchIcon />
                        {data.branches.length}{" "}
                        {data.branches.length === 1 ? "branch" : "branches"}
                        <ChevronDownIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        {data.branches.map((branch) => (
                            <DropdownMenuItem key={branch.id} render={<Link href={`/c/${branch.id}`} />}>
                                <span className="truncate">{branch.title}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </div>
    );
}
