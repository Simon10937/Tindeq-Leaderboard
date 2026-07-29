"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmit({ children, confirmation }: { children: React.ReactNode; confirmation: string }) {
  const { pending } = useFormStatus();
  return <button className="button button-danger" disabled={pending} onClick={(event) => {
    if (!window.confirm(confirmation)) event.preventDefault();
  }} type="submit">{pending ? "Working…" : children}</button>;
}
