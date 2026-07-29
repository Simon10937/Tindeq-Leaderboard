"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/server-env";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const authMessage = (message: string) => redirect(`/sign-in?message=${encodeURIComponent(message)}`);

export async function signUp(form: FormData) {
  const email = field(form, "email").toLowerCase();
  const password = field(form, "password");
  const displayName = field(form, "displayName");
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${getServerEnv().NEXT_PUBLIC_APP_URL}/api/auth/confirm?next=${field(form, "next") === "/invite" ? "/invite" : "/groups"}`,
    },
  });
  if (error) authMessage("Unable to create the account. Check the details and try again.");
  redirect("/sign-in?message=Check your email to verify your account.");
}

export async function signIn(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: field(form, "email").toLowerCase(),
    password: field(form, "password"),
  });
  const user = data.user;
  if (error || !user) return authMessage("Email or password was not accepted.");
  const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    authMessage("This account is not available.");
  }
  redirect(field(form, "next") === "/invite" ? "/invite" : "/groups");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(form: FormData) {
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(field(form, "email").toLowerCase(), {
    redirectTo: `${getServerEnv().NEXT_PUBLIC_APP_URL}/api/auth/confirm?next=/reset-password`,
  });
  authMessage("If that account exists, a reset link is on its way.");
}

export async function updatePassword(form: FormData) {
  const password = field(form, "password");
  if (password.length < 10) redirect("/reset-password?message=Use at least 10 characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?message=The reset link is invalid or expired.");
  redirect("/groups?message=Password updated.");
}
