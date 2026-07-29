import { updatePassword } from "@/features/auth/actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Account recovery</p><h1>Choose password.</h1>{message && <p role="alert">{message}</p>}<form action={updatePassword} className="stack"><label>New password<input name="password" type="password" autoComplete="new-password" minLength={10} required /></label><button className="button">Update password</button></form></section></main>;
}
