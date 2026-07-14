// Copywriting style presets for the Ad Studio generator.
// Each style feeds the AI a distinct persuasion framework.

export const AD_STYLES = {
  hormozi: {
    key: 'hormozi',
    label: 'Alex Hormozi',
    tagline: 'Grand-slam offers & value stacking',
    color: '#F59E0B',
    prompt: `Write in the style of Alex Hormozi ($100M Offers / $100M Leads):
- Lead with a blunt, high-contrast promise or a "so good it feels stupid to say no" offer.
- Stack value explicitly: name what they get, what it's worth, what it costs them not to act.
- Use plain, punchy, no-fluff language. Short sentences. Zero corporate speak.
- Address risk head-on (guarantees, proof, "here's the math").
- Speak to outcomes and money, not features. Confidence bordering on audacity.`,
  },
  brunson: {
    key: 'brunson',
    label: 'Russell Brunson',
    tagline: 'Hook, Story, Offer',
    color: '#8B5CF6',
    prompt: `Write in the style of Russell Brunson (DotCom Secrets / Expert Secrets):
- Open with a curiosity-driven HOOK that stops the scroll.
- Tell a compressed STORY: the epiphany moment, the vehicle, the transformation.
- Bridge to a clear OFFER with urgency and a strong call to action.
- Use "you" language, future-pacing ("imagine 12 months from now..."), and belief-breaking.
- Conversational, energetic, funnel-native tone.`,
  },
  schwartz: {
    key: 'schwartz',
    label: 'Eugene Schwartz',
    tagline: 'Breakthrough Advertising — channel existing desire',
    color: '#0057FF',
    prompt: `Write in the style of Eugene Schwartz (Breakthrough Advertising):
- Do not create desire — channel the mass desire that already exists onto this offer.
- Match the market's awareness stage: assume they know the problem (owning their future, escaping the job) but not this solution.
- Intensify desire through vivid, specific imagery of the end state.
- Headlines built on the dominant emotion of the market, sharpened to one idea.
- Sophisticated, precise, psychologically-driven copy. No hype for hype's sake.`,
  },
  ogilvy: {
    key: 'ogilvy',
    label: 'David Ogilvy',
    tagline: 'Research-driven, long-form class',
    color: '#10B981',
    prompt: `Write in the style of David Ogilvy:
- The headline is 80% of the ad — make it factual, specific, and benefit-loaded.
- Use research, numbers, and concrete facts as persuasion ("At 60 miles an hour...").
- Respect the reader's intelligence: elegant, clear, informative prose. Never shout.
- Long-form-friendly body copy that sells through information and quiet authority.
- Brand-building tone: credible, classy, timeless.`,
  },
};

export const STYLE_KEYS = Object.keys(AD_STYLES);
