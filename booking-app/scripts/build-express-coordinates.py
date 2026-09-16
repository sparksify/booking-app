"""Build offline coordinates from public 2025 Census Gazetteer ZIP files.
Usage: python3 scripts/build-express-coordinates.py places.zip county-subdivisions.zip
Sources: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/
"""
import csv
import io
import json
import re
import sys
import zipfile
from pathlib import Path

def records(path):
    with zipfile.ZipFile(path) as archive:
        text = archive.read(archive.namelist()[0]).decode('utf-8-sig')
        yield from csv.DictReader(io.StringIO(text), delimiter='|')

def place_name(name):
    return re.sub(r' (?:city and borough|unified government|consolidated government|metropolitan government|municipality|borough|township|village|city|town|CDP)(?: \(balance\))?$', '', name)

rows = []
known = set()
for record in records(sys.argv[1]):
    name, state = place_name(record['NAME']), record['USPS']
    rows.append([name, state, round(float(record['INTPTLAT']), 4), round(float(record['INTPTLONG']), 4)])
    known.add((name.lower(), state))
# These states organize some populated municipalities as towns/townships rather
# than Census places. Keep all duplicate place names so lookup can reject ambiguity.
for record in records(sys.argv[2]):
    if record['USPS'] not in {'CT', 'MA', 'ME', 'NH', 'RI', 'VT', 'NJ'}:
        continue
    name, state = place_name(record['NAME']), record['USPS']
    if (name.lower(), state) not in known:
        rows.append([name, state, round(float(record['INTPTLAT']), 4), round(float(record['INTPTLONG']), 4)])
rows.sort(key=lambda row: (row[1], row[0]))
output = Path(__file__).resolve().parents[1] / 'lib/data/usPlaceCoordinates.mjs'
output.write_text('// Generated from public U.S. Census 2025 Gazetteer place and town internal points.\n'
                  '// See scripts/build-express-coordinates.py and docs/green-team-express.md.\n'
                  'export default [\n' + ',\n'.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in rows) + '\n];\n')
print(f'Generated {len(rows):,} locations ({output.stat().st_size:,} bytes)')
