import Link from "next/link";

export default function SignInPage() {
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Cruxboard</p><h1>Welcome back.</h1><p>Authentication wiring arrives with the accounts unit. Supabase email/password only—no public profiles.</p><Link className="button" href="/">Back home</Link></section></main>;
}
