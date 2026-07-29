import Link from "next/link";
import { requestPasswordReset } from "@/features/auth/actions";

export default function ForgotPasswordPage() {
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Account recovery</p><h1>Reset password.</h1><form action={requestPasswordReset} className="stack"><label>Email<input name="email" type="email" autoComplete="email" required /></label><button className="button">Send reset link</button></form><p><Link href="/sign-in">Back to sign in</Link></p></section></main>;
}
