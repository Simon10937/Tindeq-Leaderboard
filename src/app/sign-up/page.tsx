import Link from "next/link";
import { signUp } from "@/features/auth/actions";

export default function SignUpPage() {
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Invite-only groups</p><h1>Start a group.</h1><p>Create a verified account, then invite your climbing partners.</p><form action={signUp} className="stack"><label>Display name<input name="displayName" minLength={1} maxLength={80} required /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={10} required /></label><button className="button">Create account</button></form><p><Link href="/sign-in">Already have an account?</Link></p></section></main>;
}
