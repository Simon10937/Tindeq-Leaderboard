import Link from "next/link";
import { signIn } from "@/features/auth/actions";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ message?: string; next?: string }> }) {
  const { message, next } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Cruxboard</p><h1>Welcome back.</h1>
        {message && <p role="status" className="notice">{message}</p>}
        <form action={signIn} className="stack">
          {next === "/invite" && <input type="hidden" name="next" value="/invite" />}
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button">Sign in</button>
        </form>
        <p><Link href="/forgot-password">Forgot password?</Link> · <Link href="/sign-up">Create account</Link></p>
      </section>
    </main>
  );
}
