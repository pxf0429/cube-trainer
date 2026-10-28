"""Read the supplied XLS grid without changing the workbook."""
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
try:
    import xlrd
except ImportError:
    sys.path.insert(0, str(ROOT / '.cache' / 'word-tools'))
    import xlrd


def split_words(value):
    # Slashes inside explanations are part of the word, e.g. on（开机/向前）.
    result, current, depth = [], [], 0
    for char in str(value).strip():
        if char in '(（':
            depth += 1
        elif char in ')）':
            depth = max(0, depth - 1)
        if char in '/／\\\n' and depth == 0:
            if ''.join(current).strip():
                result.append(''.join(current).strip())
            current = []
        else:
            current.append(char)
    if ''.join(current).strip():
        result.append(''.join(current).strip())
    return list(dict.fromkeys(result))


def column_name(index):
    result = ''
    while index:
        index, digit = divmod(index - 1, 26)
        result = chr(65 + digit) + result
    return result


def extract(file):
    workbook = xlrd.open_workbook(str(file))
    sheet = workbook.sheet_by_index(0)
    codes, cells = {}, {}
    for row in range(1, sheet.nrows):
        second = str(sheet.cell_value(row, 0)).strip().upper()
        if not re.fullmatch('[A-Z]', second):
            continue
        for col in range(1, sheet.ncols):
            first = str(sheet.cell_value(0, col)).strip().upper()
            if not re.fullmatch('[A-Z]', first):
                continue
            key = first + ' ' + second
            if key in codes:
                raise ValueError('Duplicate code: ' + key)
            codes[key] = split_words(sheet.cell_value(row, col))
            cells[key] = column_name(col + 1) + str(row + 1)
    return {'version': 1, 'source': {'file': file.name, 'sheet': sheet.name,
            'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
            'firstLetter': 'column', 'secondLetter': 'row'}, 'codes': codes, 'cells': cells}


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    result = extract(Path(sys.argv[1]))
    destination = ROOT / 'src' / 'data' / 'BLDCandidates.json'
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    words = [word for group in result['codes'].values() for word in group]
    print(json.dumps({'groups': len(result['codes']), 'populated': sum(bool(g) for g in result['codes'].values()),
                      'words': len(words), 'uniqueWords': len(set(words))}, ensure_ascii=False))
