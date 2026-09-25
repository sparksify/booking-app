export const SCOUT_STRATEGIES = ['EXPANSION','MULTI_LOCATION','BEST_OF','AWARDS','LOCAL_MEDIA','MOVERS_SHAKERS','EMERGING_BRAND'];
export const SCOUT_VERTICALS = ['Food & Beverage','Fitness','Health & Wellness','Beauty & Personal Care','Pet Services','Auto Services','Home Services','Senior Care','Cleaning Services',"Children's Education",'Real Estate Services','Marketing & Media'];
export const SCOUT_MARKETS = [
  ['Dallas-Fort Worth','Dallas','TX'],['Austin','Austin','TX'],['Houston','Houston','TX'],['San Antonio','San Antonio','TX'],
  ['Atlanta','Atlanta','GA'],['Nashville','Nashville','TN'],['Charlotte','Charlotte','NC'],['Raleigh','Raleigh','NC'],
  ['Phoenix','Phoenix','AZ'],['Denver','Denver','CO'],['Miami','Miami','FL'],['Tampa','Tampa','FL'],['Orlando','Orlando','FL'],
  ['Jacksonville','Jacksonville','FL'],['Chicago','Chicago','IL'],['Minneapolis','Minneapolis','MN'],['Kansas City','Kansas City','MO'],
  ['St. Louis','St. Louis','MO'],['Columbus','Columbus','OH'],['Cincinnati','Cincinnati','OH'],['Indianapolis','Indianapolis','IN'],
  ['Detroit','Detroit','MI'],['Philadelphia','Philadelphia','PA'],['Boston','Boston','MA'],['New York','New York','NY'],
  ['Northern New Jersey','Newark','NJ'],['Washington DC','Washington','DC'],['Baltimore','Baltimore','MD'],['Richmond','Richmond','VA'],
  ['Virginia Beach','Virginia Beach','VA'],['Charleston','Charleston','SC'],['Savannah','Savannah','GA'],['New Orleans','New Orleans','LA'],
  ['Birmingham','Birmingham','AL'],['Louisville','Louisville','KY'],['Oklahoma City','Oklahoma City','OK'],['Tulsa','Tulsa','OK'],
  ['Wichita','Wichita','KS'],['Salt Lake City','Salt Lake City','UT'],['Las Vegas','Las Vegas','NV'],['San Diego','San Diego','CA'],
  ['Los Angeles','Los Angeles','CA'],['Orange County','Irvine','CA'],['San Francisco Bay Area','San Francisco','CA'],
  ['Sacramento','Sacramento','CA'],['Portland','Portland','OR'],['Seattle','Seattle','WA']
].map(([metro,city,state])=>({metro,city,state,country:'US'}));
