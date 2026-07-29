import Link from "next/link";

const features = [
  ["Protocol matched", "Grip, edge, hand and scoring rules stay attached to every result."],
  ["Evidence preserved", "Original exports remain private while canonical metrics stay replayable."],
  ["Progress together", "Compare all-time bests and improvement without flattening personal history."],
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="Primary navigation">
        <Link className="brand" href="/">Cruxboard</Link>
        <Link className="button button-quiet" href="/sign-in">Sign in</Link>
      </nav>
      <section className="hero shell">
        <div>
          <p className="eyebrow">Private Tindeq training groups</p>
          <h1>Finger strength,<br /><em>measured together.</em></h1>
          <p className="lede">Upload Tindeq CSVs. Compare like-for-like tests. See who is getting stronger—and why the numbers can be trusted.</p>
          <div className="actions">
            <Link className="button" href="/sign-up">Create an account</Link>
            <span>Invite-only groups · Metric units</span>
          </div>
        </div>
        <div className="meter" aria-label="Illustrative force trace">
          <span>RFD · 20–80%</span>
          <strong>892</strong><small>%BW/s</small>
          <svg viewBox="0 0 480 180" role="img" aria-label="Rising illustrative force curve">
            <path d="M0 160 C60 160 90 154 130 140 S190 85 235 52 S320 30 480 20" />
          </svg>
        </div>
      </section>
      <section className="features shell" aria-label="Product principles">
        {features.map(([title, copy], index) => (
          <article key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{copy}</p></article>
        ))}
      </section>
    </main>
  );
}
