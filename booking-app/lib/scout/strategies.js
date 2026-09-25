const terms = {
  EXPANSION: ['"opening second location"','"opening third location"','"new location" expanding','"plans to expand"'],
  MULTI_LOCATION: ['independent business "locations"','local brand multiple locations','regional concept locations'],
  BEST_OF: ['best independent businesses','readers choice local business','best local'],
  AWARDS: ['small business award winners','chamber business awards','fastest growing companies awards'],
  LOCAL_MEDIA: ['local business growth founder','local business news expansion','city magazine growing business'],
  MOVERS_SHAKERS: ['entrepreneur to watch company','40 under 40 founder business','movers and shakers entrepreneur'],
  EMERGING_BRAND: ['"cult favorite" local business','"wildly popular" local concept','"regional favorite" expanding']
};
export function buildMissionQuery(mission) {
  const choices=terms[mission.strategy]||terms.BEST_OF;
  const phrase=choices[(mission.query_variant||0)%choices.length];
  return `${mission.city} ${mission.vertical} ${phrase} -franchise`;
}
export function nextMissionDelayDays(mission, found=0) {
  if (mission.consecutive_errors >= 5) return 14;
  if (mission.consecutive_errors >= 3) return 7;
  const yieldRate=mission.run_count ? mission.candidates_qualified/mission.run_count : 0;
  return found || yieldRate >= .5 ? 3 : mission.run_count > 2 ? 14 : 7;
}
