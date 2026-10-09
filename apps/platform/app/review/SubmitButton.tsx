"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingText, className = "btn", name, value, disabled }: {
  children: React.ReactNode; pendingText: string; className?: string; name?: string; value?: string; disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return <button className={className} name={name} value={value} disabled={disabled || pending} aria-busy={pending}>{pending ? pendingText : children}</button>;
}
