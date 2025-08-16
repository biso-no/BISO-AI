"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { ComponentProps } from "react";

type Props = ComponentProps<typeof Button> & {
    pendingText?: string;
};

export default function SubmitButton({ pendingText = "Submitting…", children, ...props }: Props) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" aria-disabled={pending} disabled={pending} {...props}>
            {pending ? pendingText : children}
        </Button>
    );
}


