// CMDT franchise landing — copy + CSS for the /watch funnel page.
// __WISTIA_ID__ = video id; <!--KANSO_FORM--> = where the questionnaire+calendar render.
export const css = `
/* ============================================================
   TOKENS — light document stock, graphite ink, safety yellow
   ============================================================ */
:root{
  --paper:#F1F4F7;
  --white:#FFFFFF;
  --tint:#E6EBF0;
  --ink:#0F151C;
  --ink-2:#2C3742;
  --muted:#5B6773;
  --muted-2:#8B97A4;
  --line:#D6DEE6;
  --line-2:#BFCAD5;
  --hi:#FFC91B;
  --hi-deep:#7A5A00;
  --plate:#151D25;
  --plate-line:#2E3945;

  --display:'Archivo',system-ui,sans-serif;
  --body:'IBM Plex Sans',system-ui,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,monospace;

  --wrap:1120px;
  --gut:20px;
  --band:clamp(56px,11vw,116px);
  --bar-h:76px;
}

*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;
  background:var(--paper);
  color:var(--ink-2);
  font-family:var(--body);
  font-size:17px;
  line-height:1.6;
  overflow-x:hidden;
  padding-bottom:calc(var(--bar-h) + env(safe-area-inset-bottom));
}
@media(min-width:820px){ body{ padding-bottom:0 } }

img{max-width:100%;display:block}
a{color:inherit}
:focus-visible{outline:3px solid var(--hi-deep);outline-offset:3px;border-radius:2px}

.wrap{width:100%;max-width:var(--wrap);margin:0 auto;padding-left:var(--gut);padding-right:var(--gut)}
.band{padding-top:var(--band);padding-bottom:var(--band)}
.on-white{background:var(--white);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.on-tint{background:var(--tint)}
.hairline{height:1px;background:var(--line);border:0;margin:0}

/* hazard tape — used twice, deliberately */
.tape{height:5px;background:repeating-linear-gradient(115deg,var(--hi) 0 12px,var(--ink) 12px 24px)}

/* ============================================================
   TYPE
   ============================================================ */
.eyebrow{
  font-family:var(--mono);
  font-size:11px;
  font-weight:600;
  letter-spacing:.18em;
  text-transform:uppercase;
  color:var(--hi-deep);
  display:flex;
  align-items:center;
  gap:9px;
  margin:0 0 22px;
}
.eyebrow::before{
  content:"";
  width:8px;height:8px;
  background:var(--hi);
  border:1px solid var(--hi-deep);
  flex:none;
}

h1,h2,h3{font-family:var(--display);font-weight:800;text-transform:uppercase;margin:0;letter-spacing:-.015em;color:var(--ink)}

h1{font-size:clamp(2.45rem,10.2vw,4.9rem);line-height:.94}
h1 .lo{
  display:block;
  font-weight:600;
  color:var(--muted);
  font-size:.42em;
  letter-spacing:.02em;
  line-height:1.3;
  margin-bottom:.7em;
}

/* highlighter swipe — marker on a printed page */
.mark-hi{
  color:var(--ink);
  background:linear-gradient(180deg,transparent 58%,rgba(255,201,27,.72) 58%);
  padding:0 .06em;
}

h2{font-size:clamp(1.85rem,7.2vw,3.1rem);line-height:1.02}
h2 .thin{display:block;font-weight:600;color:var(--muted)}
h3{font-size:clamp(1.15rem,4.6vw,1.4rem);line-height:1.15}

.lede{font-size:clamp(1.02rem,4.1vw,1.2rem);color:var(--muted);margin:22px 0 0;max-width:52ch}
.lede strong{color:var(--ink);font-weight:600}
p{margin:0 0 1.05em}
p:last-child{margin-bottom:0}

/* ============================================================
   BUTTONS
   ============================================================ */
.btn{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:12px;
  width:100%;
  min-height:60px;
  padding:16px 22px;
  background:var(--hi);
  color:var(--ink);
  font-family:var(--display);
  font-weight:800;
  font-size:clamp(.98rem,3.7vw,1.1rem);
  text-transform:uppercase;
  letter-spacing:.01em;
  text-decoration:none;
  border:1.5px solid var(--ink);
  border-radius:2px;
  cursor:pointer;
  text-align:center;
  line-height:1.15;
  box-shadow:3px 3px 0 0 var(--ink);
  transition:transform .11s ease, box-shadow .11s ease;
}
.btn:active{transform:translate(3px,3px);box-shadow:0 0 0 0 var(--ink)}
@media(hover:hover){ .btn:hover{transform:translate(-1px,-1px);box-shadow:5px 5px 0 0 var(--ink)} }
.btn .tri{font-size:.85em;line-height:1}
@media(min-width:600px){ .btn{width:auto;min-width:340px} }

.cta-sub{font-family:var(--mono);font-size:12.5px;color:var(--muted-2);margin-top:16px;line-height:1.6}

/* ============================================================
   VIDEO FACADE
   ============================================================ */
.video{
  position:relative;
  width:100%;
  aspect-ratio:16/9;
  background:var(--white);
  border:1.5px solid var(--ink);
  border-radius:3px;
  overflow:hidden;
  cursor:pointer;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:14px;
  padding:18px;
  text-align:center;
  box-shadow:4px 4px 0 0 var(--ink);
}
.video::before{
  content:"";
  position:absolute;inset:0;
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
  background-size:34px 34px;
  opacity:.7;
}
@media(hover:hover){ .video:hover .play{transform:scale(1.06)} }
.video iframe,.video video{position:absolute;inset:0;width:100%;height:100%;border:0}
.play{
  position:relative;
  width:clamp(62px,17vw,86px);
  height:clamp(62px,17vw,86px);
  border-radius:50%;
  background:var(--hi);
  border:1.5px solid var(--ink);
  color:var(--ink);
  display:grid;
  place-items:center;
  font-size:clamp(20px,5.4vw,27px);
  padding-left:5px;
  transition:transform .15s ease;
}
.video-label{
  position:relative;
  font-family:var(--display);
  font-weight:800;
  text-transform:uppercase;
  font-size:clamp(.92rem,3.6vw,1.05rem);
  letter-spacing:.01em;
  line-height:1.2;
  color:var(--ink);
}
.video-note{
  position:relative;
  font-family:var(--mono);
  font-size:11px;
  letter-spacing:.1em;
  text-transform:uppercase;
  color:var(--muted-2);
}
.runtime{
  position:absolute;
  right:12px;bottom:12px;
  font-family:var(--mono);
  font-size:11px;
  font-weight:600;
  letter-spacing:.08em;
  background:var(--ink);
  color:var(--white);
  padding:5px 9px;
  border-radius:2px;
}

/* ============================================================
   HERO
   ============================================================ */
.hero{padding-top:clamp(30px,8vw,62px);padding-bottom:clamp(44px,9vw,84px)}
.hero-grid{display:grid;gap:clamp(30px,6vw,54px)}
@media(min-width:960px){ .hero-grid{grid-template-columns:1.02fr .98fr;align-items:center;gap:60px} }
.hero-copy p.deck{color:var(--ink-2);font-size:clamp(1rem,3.9vw,1.12rem);margin-top:26px;max-width:46ch}
.hero-copy p.deck strong{color:var(--ink);font-weight:600}

.trio{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px;list-style:none;padding:0}
.trio li{
  font-family:var(--mono);
  font-size:11.5px;
  letter-spacing:.06em;
  text-transform:uppercase;
  color:var(--muted);
  background:var(--white);
  border:1px solid var(--line-2);
  padding:8px 11px;
  border-radius:2px;
}

/* ============================================================
   DATA PLATE — the one dark object on the page
   ============================================================ */
.plate{
  background:var(--plate);
  border:1.5px solid var(--ink);
  border-radius:3px;
  overflow:hidden;
  box-shadow:5px 5px 0 0 rgba(15,21,28,.14);
}
.plate-head{
  display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:13px 16px;
  border-bottom:1px solid var(--plate-line);
  font-family:var(--mono);
  font-size:10.5px;
  letter-spacing:.16em;
  text-transform:uppercase;
  color:#8B97A4;
}
.plate-grid{display:grid;grid-template-columns:1fr 1fr}
.cell{padding:22px 16px;border-bottom:1px solid var(--plate-line)}
.cell:nth-child(odd){border-right:1px solid var(--plate-line)}
.cell:nth-last-child(-n+2){border-bottom:0}
@media(min-width:760px){
  .plate-grid{grid-template-columns:repeat(4,1fr)}
  .cell{border-bottom:0;padding:30px 22px;border-right:1px solid var(--plate-line)}
  .cell:last-child{border-right:0}
}
.cell .fig{
  font-family:var(--display);
  font-weight:800;
  font-size:clamp(1.7rem,7.4vw,2.5rem);
  line-height:1;
  color:var(--white);
  letter-spacing:-.02em;
}
.cell:first-child .fig{color:var(--hi)}
.cell .cap{
  font-family:var(--mono);
  font-size:10.5px;
  letter-spacing:.13em;
  text-transform:uppercase;
  color:#8B97A4;
  margin-top:11px;
  line-height:1.5;
}
.plate-foot{
  border-top:1px solid var(--plate-line);
  padding:13px 16px;
  font-family:var(--mono);
  font-size:10.5px;
  line-height:1.65;
  color:#77838F;
}

/* ============================================================
   NETWORK
   ============================================================ */
.marquee{
  border-top:1px solid var(--line);
  border-bottom:1px solid var(--line);
  overflow:hidden;
  padding:20px 0;
  margin:34px 0 0;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);
}
.marquee-track{display:flex;gap:clamp(28px,7vw,64px);width:max-content;animation:slide 26s linear infinite}
.marquee-track span{
  font-family:var(--display);
  font-weight:700;
  font-size:clamp(1.05rem,4.4vw,1.5rem);
  text-transform:uppercase;
  letter-spacing:.03em;
  color:var(--muted-2);
  white-space:nowrap;
}
@keyframes slide{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){
  .marquee-track{animation:none;flex-wrap:wrap;width:auto;justify-content:center}
}
.marq-cap{
  font-family:var(--mono);
  font-size:11px;
  letter-spacing:.1em;
  text-transform:uppercase;
  color:var(--muted-2);
  margin-top:14px;
  text-align:center;
}

/* ============================================================
   CHAIN-OF-CUSTODY FORM
   ============================================================ */
.form{
  background:var(--white);
  border:1.5px solid var(--ink);
  border-radius:3px;
  margin-top:clamp(30px,6vw,44px);
  box-shadow:5px 5px 0 0 rgba(15,21,28,.12);
}
.form-head{
  display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:baseline;
  padding:14px 16px;
  border-bottom:2px solid var(--ink);
  font-family:var(--mono);
  font-size:10.5px;
  letter-spacing:.14em;
  text-transform:uppercase;
  color:var(--muted);
}
.form-head b{color:var(--ink);font-weight:600}
.row{display:flex;align-items:center;gap:14px;padding:15px 16px;border-bottom:1px dashed var(--line-2)}
.row:last-of-type{border-bottom:0}
.box{
  flex:none;
  width:24px;height:24px;
  border:1.5px solid var(--ink);
  display:grid;place-items:center;
  background:var(--hi);
  font-size:15px;
  font-weight:700;
  color:var(--ink);
  line-height:1;
}
.row .rt{font-family:var(--display);font-weight:700;text-transform:uppercase;font-size:clamp(.95rem,3.9vw,1.08rem);line-height:1.2;color:var(--ink)}
.row .rs{font-size:13.5px;color:var(--muted);line-height:1.45;margin-top:3px}
.form-foot{
  padding:15px 16px;
  border-top:2px solid var(--ink);
  font-family:var(--mono);
  font-size:11px;
  letter-spacing:.05em;
  text-transform:uppercase;
  color:var(--ink);
  display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:space-between;
}
.after{margin-top:clamp(26px,5vw,34px);color:var(--muted);font-size:clamp(1rem,3.9vw,1.1rem);max-width:54ch}
.after strong{color:var(--ink);font-weight:600}

/* ============================================================
   SPEC LIST
   ============================================================ */
.specs{list-style:none;margin:clamp(28px,6vw,44px) 0 0;padding:0;border-top:1px solid var(--line)}
.specs li{display:flex;gap:16px;align-items:baseline;padding:18px 2px;border-bottom:1px solid var(--line)}
.specs .k{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--hi-deep);letter-spacing:.1em;flex:none;width:26px;padding-top:3px}
.specs .v{font-family:var(--display);font-weight:700;text-transform:uppercase;font-size:clamp(1rem,4.2vw,1.22rem);line-height:1.22;color:var(--ink)}
.specs .v em{display:block;font-family:var(--body);font-style:normal;font-weight:400;text-transform:none;font-size:14.5px;color:var(--muted);margin-top:5px;letter-spacing:0}

/* ============================================================
   TRIGGER STRIP
   ============================================================ */
.triggers{display:grid;gap:1px;background:var(--line-2);border:1px solid var(--line-2);border-radius:3px;margin-top:clamp(28px,6vw,42px)}
@media(min-width:700px){.triggers{grid-template-columns:repeat(4,1fr)}}
.trig{background:var(--white);padding:20px 18px}
.trig .n{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:var(--hi-deep);font-weight:600}
.trig .t{font-family:var(--display);font-weight:700;text-transform:uppercase;font-size:1.02rem;margin-top:9px;line-height:1.2;color:var(--ink)}

/* ============================================================
   CLOSE
   ============================================================ */
.close h2{max-width:16ch}
.close-grid{display:grid;gap:clamp(30px,6vw,52px)}
@media(min-width:960px){.close-grid{grid-template-columns:1fr 1fr;align-items:center;gap:56px}}

/* ============================================================
   LEAD FORM
   ============================================================ */
.lead{
  background:var(--white);
  border:1.5px solid var(--ink);
  border-radius:3px;
  padding:clamp(20px,5vw,30px);
  margin-top:clamp(30px,6vw,40px);
  box-shadow:5px 5px 0 0 rgba(15,21,28,.12);
}
.lead .hint{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--hi-deep);margin:0 0 10px}
.lead .sub{color:var(--muted);font-size:15px;margin-top:10px}
.fields{display:grid;gap:12px;margin:22px 0 0}
@media(min-width:640px){.fields{grid-template-columns:1fr 1fr}.fields .full{grid-column:1/-1}}
.field label{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.field input,.field select{
  width:100%;
  min-height:54px;
  background:var(--paper);
  border:1px solid var(--line-2);
  border-radius:2px;
  color:var(--ink);
  font-family:var(--body);
  font-size:16px;
  padding:0 14px;
  appearance:none;
}
.field select{background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 20px) 24px,calc(100% - 14px) 24px;background-size:6px 6px;background-repeat:no-repeat}
.field input:focus,.field select:focus{border-color:var(--ink);background:var(--white);outline:none}
.consent{font-family:var(--mono);font-size:10.5px;line-height:1.7;color:var(--muted-2);margin-top:16px}
.ok{
  display:none;
  border:1.5px solid var(--ink);
  background:rgba(255,201,27,.2);
  padding:18px;
  border-radius:2px;
  font-family:var(--mono);
  font-size:13px;
  line-height:1.6;
  color:var(--ink);
}

/* ============================================================
   STICKY BAR
   ============================================================ */
.sticky{
  position:fixed;
  left:0;right:0;bottom:0;
  z-index:60;
  background:rgba(255,255,255,.97);
  backdrop-filter:blur(10px);
  border-top:1px solid var(--line-2);
  padding:12px var(--gut) calc(12px + env(safe-area-inset-bottom));
  transform:translateY(110%);
  transition:transform .28s cubic-bezier(.3,.8,.3,1);
}
.sticky.on{transform:translateY(0)}
.sticky .tape{position:absolute;top:0;left:0;right:0;height:3px}
.sticky .btn{min-height:56px;width:100%;min-width:0;box-shadow:2px 2px 0 0 var(--ink)}
@media(min-width:820px){ .sticky{display:none} }

/* ============================================================
   FOOTER
   ============================================================ */
footer{background:var(--white);border-top:1px solid var(--line);padding:40px 0 54px}
.legal{font-family:var(--mono);font-size:10.5px;line-height:1.8;color:var(--muted-2);max-width:80ch}
.legal + .legal{margin-top:14px}
.mark{font-family:var(--display);font-weight:800;text-transform:uppercase;letter-spacing:.02em;font-size:1.15rem;color:var(--ink);margin-bottom:18px}
.mark span{background:var(--hi);padding:0 5px}
`;

export const html = `

<div class="tape" aria-hidden="true"></div>

<!-- ==========================================================
     HERO
     ========================================================== -->
<header class="hero wrap">
  <div class="hero-grid">

    <div class="hero-copy">
      <p class="eyebrow">Franchise Opportunity · Limited Territories Available</p>

      <h1>
        <span class="lo">A <span class="mark-hi">$961K</span> B2B business</span>
        Hiding in<br>Plain Sight
      </h1>

      <p class="deck">
        Own a mobile business built around <strong>recurring workplace testing</strong> — and join a
        nationwide testing network serving businesses such as Amazon, Walmart, Costco, and Home Depot.
      </p>

      <p class="deck">
        CMDT spent 13+ years building the model. Now, for the first time, franchise owners can
        bring it to their own territories.
      </p>

      <ul class="trio">
        <li>No traditional storefront</li>
        <li>Repeat B2B testing needs</li>
        <li>National network opportunities</li>
      </ul>
    </div>

    <div class="hero-video">
      <!-- ============================================
           VIDEO PLACEHOLDER #1 — HERO
           Paste your embed URL into data-embed below.
           Vimeo:   data-embed="https://player.vimeo.com/video/000000?autoplay=1"
           YouTube: data-embed="https://www.youtube.com/embed/XXXX?autoplay=1&rel=0"
           Optional poster: style="background-image:url('poster.jpg');background-size:cover"
           ============================================ -->
      <div class="video" style="cursor:default"><wistia-player media-id="__WISTIA_ID__" aspect="1.7777777777777777" style="width:100%;height:100%;display:block"></wistia-player></div><div style="margin-top:24px">
        <a class="btn" href="#territory"><span class="tri">▶</span> Check Your Territory</a>
        <p class="cta-sub">
          See how the model works, where the demand comes from,<br>
          and what an available territory could look like.
        </p>
      </div>
    </div>

  </div>
</header>

<!-- ==========================================================
     DATA PLATE
     ========================================================== -->
<section class="wrap" style="padding-bottom:var(--band)">
  <div class="plate">
    <div class="plate-head">
      <span>Corporate Performance Record</span>
      <span>FY 2024</span>
    </div>
    <div class="plate-grid">
      <div class="cell">
        <div class="fig">$961K</div>
        <div class="cap">2024 Corporate<br>Revenue</div>
      </div>
      <div class="cell">
        <div class="fig">42%</div>
        <div class="cap">Net Profit<br>Margin</div>
      </div>
      <div class="cell">
        <div class="fig">13+</div>
        <div class="cap">Years Operating<br>History</div>
      </div>
      <div class="cell">
        <div class="fig">~$72K</div>
        <div class="cap">Entry<br>Investment</div>
      </div>
    </div>
    <div class="plate-foot">
      Financial performance and investment information should be evaluated against the current FDD. Individual results vary.
    </div>
  </div>
</section>

<!-- ==========================================================
     NETWORK
     ========================================================== -->
<section class="band on-white">
  <div class="wrap">
    <p class="eyebrow">The Network Advantage</p>
    <h2>You don't have to build<br><span class="thin">every customer relationship<br>from scratch.</span></h2>

    <p class="lede">
      This is where CMDT gets interesting. As a CMDT franchisee, you're not just opening a local
      mobile drug-testing business. You become part of a nationwide drug-testing network.
    </p>

    <div class="marquee" aria-label="Businesses served by the network include Amazon, Walmart, Costco, and Home Depot">
      <div class="marquee-track" aria-hidden="true">
        <span>Amazon</span><span>·</span><span>Walmart</span><span>·</span><span>Costco</span><span>·</span><span>Home Depot</span><span>·</span>
        <span>Amazon</span><span>·</span><span>Walmart</span><span>·</span><span>Costco</span><span>·</span><span>Home Depot</span><span>·</span>
      </div>
    </div>
    <p class="marq-cap">That network provides testing services for businesses such as the above</p>

    <p class="lede" style="margin-top:30px">
      And when mobile testing is needed in your territory, your CMDT location can be positioned to
      fulfill that service locally. So while you're building relationships with employers in your own
      market, you're also part of something much bigger than a standalone local operator.
    </p>
  </div>
</section>

<!-- ==========================================================
     CHAIN-OF-CUSTODY FORM
     ========================================================== -->
<section class="band on-tint">
  <div class="wrap">
    <p class="eyebrow">The Real Opportunity</p>
    <h2>The opportunity isn't drug testing.<br><span class="thin">It's becoming the local infrastructure behind a recurring business need.</span></h2>

    <p class="lede" style="margin-top:24px">
      Employers hire. They conduct random testing. Workplace incidents happen. Testing needs to get done.
      And businesses don't always want employees leaving the workplace, driving to a clinic, waiting,
      and then driving back. <strong>CMDT brings the testing to them.</strong>
    </p>

    <div class="form">
      <div class="form-head">
        <span><b>Reason for Test</b> — Employer Request Form</span>
        <span>Territory ____</span>
      </div>

      <div class="row">
        <span class="box" aria-hidden="true">✓</span>
        <span>
          <span class="rt">Pre-employment</span>
          <span class="rs">Every new hire is a new test.</span>
        </span>
      </div>
      <div class="row">
        <span class="box" aria-hidden="true">✓</span>
        <span>
          <span class="rt">Random</span>
          <span class="rs">Scheduled programs that repeat all year.</span>
        </span>
      </div>
      <div class="row">
        <span class="box" aria-hidden="true">✓</span>
        <span>
          <span class="rt">Post-accident</span>
          <span class="rs">Called in fast, when it can't wait.</span>
        </span>
      </div>
      <div class="row">
        <span class="box" aria-hidden="true">✓</span>
        <span>
          <span class="rt">Reasonable suspicion</span>
          <span class="rs">Unplanned, on demand, on site.</span>
        </span>
      </div>
      <div class="row">
        <span class="box" aria-hidden="true">✓</span>
        <span>
          <span class="rt">On-site</span>
          <span class="rs">You go to them. That's the whole model.</span>
        </span>
      </div>

      <div class="form-foot">
        <span>One employer · multiple reasons to call you again</span>
        <span>CMDT · Mobile</span>
      </div>
    </div>

    <p class="after">
      And through the larger network, your territory may also have opportunities to service
      <strong>companies you would otherwise struggle to reach on your own.</strong>
    </p>
  </div>
</section>

<!-- ==========================================================
     WHY IT WORKS
     ========================================================== -->
<section class="band on-white">
  <div class="wrap">
    <p class="eyebrow">Why Owners Choose It</p>
    <h2>You don't need to love drug testing.<br><span class="thin">You need to like the business model.</span></h2>

    <ul class="specs">
      <li><span class="k">01</span><span class="v">Recurring B2B demand<em>Employers test again, and again, and again.</em></span></li>
      <li><span class="k">02</span><span class="v">Mobile operation<em>No traditional storefront to sign for or staff.</em></span></li>
      <li><span class="k">03</span><span class="v">13+ years of operating history<em>A model that's already been run, not theorized.</em></span></li>
      <li><span class="k">04</span><span class="v">Access to a nationwide testing network<em>Demand that doesn't start with a cold call.</em></span></li>
      <li><span class="k">05</span><span class="v">Service recognized employers in your territory<em>Work you'd struggle to win as a standalone operator.</em></span></li>
      <li><span class="k">06</span><span class="v">A territory of your own to build<em>Limited territories currently available.</em></span></li>
    </ul>
  </div>
</section>

<!-- ==========================================================
     CLOSE — video 2 + territory form
     ========================================================== -->
<!--KANSO_FORM-->

<!-- ==========================================================
     FOOTER
     ========================================================== -->
<footer>
  <div class="wrap">
    <div class="mark">CM<span>DT</span> · Complete Mobile Drug Testing</div>
    <p class="legal">
      Financial performance and investment information should be evaluated against the current
      Franchise Disclosure Document (FDD). Individual results vary. Figures shown reflect corporate
      operations and are not a projection or guarantee of the results any franchisee will achieve.
    </p>
    <p class="legal">
      This information is not intended as an offer to sell, or the solicitation of an offer to buy,
      a franchise. Offerings are made by Franchise Disclosure Document only. Certain states require
      registration prior to offering or selling a franchise in that state. Company names referenced
      are used to describe end-customer categories served by the network and do not imply endorsement,
      affiliation, or sponsorship.
    </p>
    <p class="legal">&copy; <span id="yr">2026</span> Complete Mobile Drug Testing. All rights reserved.</p>
  </div>
</footer>

<!-- ==========================================================
     STICKY MOBILE CTA
     ========================================================== -->
<div class="sticky" id="sticky">
  <div class="tape" aria-hidden="true"></div>
  <a class="btn" href="#territory"><span class="tri">▶</span> Watch &amp; Check Territory</a>
</div>


`;

export default { css, html };
