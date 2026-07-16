// Client-facing landing page for bookkanso.co (root, no brand slug).
// Purely informational — no booking can happen here.
import { useState, useEffect } from 'react';
import Head from 'next/head';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TIMES = ['9:00 AM', '10:30 AM', '1:00 PM', '2:30 PM', '4:00 PM'];

export default function BookHome() {
  // Gentle auto-play: the demo card picks a day, then a time, then confirms, then resets.
  const [step, setStep] = useState(0);       // 0 pick day, 1 pick time, 2 confirmed
  const [day, setDay] = useState(2);
  const [time, setTime] = useState(1);
  const [poked, setPoked] = useState(false); // user clicked the demo

  useEffect(() => {
    const seq = [
      () => { setStep(0); setDay((d) => (d + 2) % 5); },
      () => setStep(1),
      () => setTime((t) => (t + 3) % 5),
      () => setStep(2),
      () => {},
    ];
    let i = 0;
    const id = setInterval(() => { seq[i % seq.length](); i++; }, 1600);
    return () => clearInterval(id);
  }, []);

  const poke = () => { setPoked(true); setTimeout(() => setPoked(false), 3200); };

  return (
    <div className="bk-root">
      <Head>
        <title>Kanso Booking — the simplest way to book a time</title>
        <meta name="description" content="One link. Pick a time. Done. Kanso booking pages make scheduling effortless." />
      </Head>

      <style dangerouslySetInnerHTML={{ __html: `
        .bk-root{min-height:100vh;background:#faf9f7;color:#1c1b1a;font-family:-apple-system,'Helvetica Neue',sans-serif;display:flex;flex-direction:column}
        .bk-root ::selection{background:#e05d3d;color:#fff}
        .bk-nav{display:flex;justify-content:space-between;align-items:center;padding:26px 6vw}
        .bk-logo{font-family:Georgia,serif;font-size:22px;letter-spacing:-.01em}
        .bk-logo span{color:#e05d3d}
        .bk-nav a{font-size:13px;color:#8a8782;text-decoration:none;letter-spacing:.05em}
        .bk-nav a:hover{color:#1c1b1a}
        .bk-main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:6vw;align-items:center;padding:4vh 6vw 8vh;max-width:1200px;margin:0 auto;width:100%}
        @media(max-width:880px){.bk-main{grid-template-columns:1fr;gap:48px;text-align:center}}
        .bk-kicker{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#e05d3d;margin-bottom:20px}
        h1{font-family:Georgia,serif;font-weight:400;font-size:clamp(38px,4.6vw,62px);line-height:1.1;letter-spacing:-.01em;margin:0}
        .bk-sub{color:#6e6b66;font-size:17px;line-height:1.7;margin-top:22px;max-width:440px}
        @media(max-width:880px){.bk-sub{margin-left:auto;margin-right:auto}}
        .bk-points{margin-top:36px;display:flex;flex-direction:column;gap:14px}
        .bk-point{display:flex;gap:12px;align-items:baseline;font-size:15px;color:#44423f}
        .bk-point i{font-style:normal;color:#e05d3d}
        @media(max-width:880px){.bk-points{align-items:center}}
        /* demo card */
        .bk-card{background:#fff;border:1px solid #e8e5e0;border-radius:20px;box-shadow:0 24px 60px rgba(28,27,26,.08);padding:30px;max-width:420px;width:100%;margin:0 auto;position:relative;cursor:pointer;transition:transform .3s}
        .bk-card:hover{transform:translateY(-4px)}
        .bk-card-hdr{display:flex;align-items:center;gap:14px;border-bottom:1px solid #f0ede8;padding-bottom:18px}
        .bk-ava{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#e05d3d,#c9a86a);display:flex;align-items:center;justify-content:center;color:#fff;font-family:Georgia,serif;font-size:19px}
        .bk-card-hdr b{display:block;font-size:15px;font-weight:600}
        .bk-card-hdr small{color:#8a8782;font-size:12px}
        .bk-lbl{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#8a8782;margin:20px 0 10px}
        .bk-row{display:flex;gap:8px;flex-wrap:wrap}
        .bk-chip{padding:9px 14px;border:1px solid #e8e5e0;border-radius:10px;font-size:13px;color:#44423f;transition:all .35s;background:#fff}
        .bk-chip.on{background:#1c1b1a;color:#fff;border-color:#1c1b1a}
        .bk-confirm{margin-top:22px;border-radius:12px;padding:14px 16px;font-size:14px;display:flex;align-items:center;gap:10px;transition:all .4s;border:1px dashed #e8e5e0;color:#b5b1aa}
        .bk-confirm.on{background:#f2f8f5;border:1px solid #bcd9cc;color:#2e7358}
        .bk-poke{position:absolute;inset:auto 16px 16px 16px;background:#1c1b1a;color:#faf9f7;font-size:12.5px;border-radius:10px;padding:12px 14px;text-align:center;opacity:0;pointer-events:none;transition:opacity .3s}
        .bk-poke.show{opacity:1}
        .bk-note{text-align:center;font-size:11.5px;color:#b5b1aa;margin-top:14px;font-family:ui-monospace,Menlo,monospace;letter-spacing:.06em}
        .bk-foot{padding:26px 6vw;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #eeebe6;font-size:12px;color:#8a8782}
        .bk-foot a{color:#8a8782;text-decoration:none}
        .bk-foot a:hover{color:#e05d3d}
        @media(max-width:880px){.bk-foot{flex-direction:column;gap:8px}}
      ` }} />

      <nav className="bk-nav">
        <div className="bk-logo">Kanso<span>.</span></div>
        <a href="https://trykanso.co">what is kanso →</a>
      </nav>

      <main className="bk-main">
        <div>
          <div className="bk-kicker">kanso booking pages</div>
          <h1>One link.<br />Pick a time.<br />Done.</h1>
          <p className="bk-sub">
            When someone sends you a <b>bookkanso.co</b> link, this is all there is to it —
            open it, tap a time that works, and it&rsquo;s on both calendars. Nothing to
            download, no account to create, no back-and-forth.
          </p>
          <div className="bk-points">
            <div className="bk-point"><i>—</i>No sign-up, ever</div>
            <div className="bk-point"><i>—</i>Times shown in your timezone</div>
            <div className="bk-point"><i>—</i>Confirmation and reminders, handled</div>
          </div>
        </div>

        <div>
          <div className="bk-card" onClick={poke} role="img" aria-label="Example booking card (demonstration only)">
            <div className="bk-card-hdr">
              <div className="bk-ava">A</div>
              <div><b>Alex&rsquo;s Booking Page</b><small>30 min · video call</small></div>
            </div>
            <div className="bk-lbl">Pick a day</div>
            <div className="bk-row">
              {DAYS.map((d, i) => (
                <div key={d} className={'bk-chip' + (i === day ? ' on' : '')}>{d}</div>
              ))}
            </div>
            <div className="bk-lbl">Pick a time</div>
            <div className="bk-row">
              {TIMES.map((t, i) => (
                <div key={t} className={'bk-chip' + (step >= 1 && i === time ? ' on' : '')}>{t}</div>
              ))}
            </div>
            <div className={'bk-confirm' + (step === 2 ? ' on' : '')}>
              {step === 2 ? '✓ Booked — invitation sent to your inbox' : 'Your confirmation appears here'}
            </div>
            <div className={'bk-poke' + (poked ? ' show' : '')}>
              This card is just a demo — real booking pages live at bookkanso.co/yourname
            </div>
          </div>
          <div className="bk-note">demonstration only · booking happens on personal links</div>
        </div>
      </main>

      <footer className="bk-foot">
        <div>© {new Date().getFullYear()} Kanso · the calm way to schedule</div>
        <div>powered by <a href="https://trykanso.co">trykanso.co</a></div>
      </footer>
    </div>
  );
}
