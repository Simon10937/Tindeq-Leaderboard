import Link from "next/link";

export default function SignUpPage() {
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Invite-only groups</p><h1>Start a group.</h1><p>Create a verified account, then invite your climbing partners into a shared protocol.</p><Link className="button" href="/">Back home</Link></section></main>;
}
