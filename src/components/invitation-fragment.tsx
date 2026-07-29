"use client";

import { useEffect, useRef } from "react";
import { redeemInvitation } from "@/features/groups/actions";

export function InvitationFragment() {
  const tokenInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (fragment) window.sessionStorage.setItem("pending-group-invitation", fragment);
    const token = fragment || window.sessionStorage.getItem("pending-group-invitation") || "";
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (tokenInput.current) tokenInput.current.value = token;
  }, []);
  return <form action={redeemInvitation} className="stack"><input ref={tokenInput} type="hidden" name="token" /><p>Confirm with the verified account that received this invitation. Missing or cleared tokens fail safely.</p><button className="button">Join group</button></form>;
}
