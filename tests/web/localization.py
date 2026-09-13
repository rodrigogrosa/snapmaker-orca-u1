#!/usr/bin/env python3
"""Check complete web key coverage and placeholders, plus native gettext validity."""
import ast
import collections
import gettext
import json
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
folder = root / 'resources/web/flutter_web/assets/assets/i10n'
source = json.loads((folder / 'en.json').read_text())
target = json.loads((folder / 'pt-BR.json').read_text())
count = 0

def check(a, b, path=''):
    global count
    if isinstance(a, dict):
        assert isinstance(b, dict) and a.keys() == b.keys(), path
        for key in a:
            check(a[key], b[key], path + '.' + key)
    else:
        assert isinstance(b, str) and b.strip(), path
        assert collections.Counter(re.findall(r'\{[^{}]*\}', a)) == collections.Counter(re.findall(r'\{[^{}]*\}', b)), path
        count += 1

check(source, target)
with tempfile.TemporaryDirectory() as directory:
    output = Path(directory) / 'pt.mo'
    subprocess.run(['msgfmt', '--check', '-o', str(output), str(root / 'localization/i18n/pt_BR/Snapmaker_Orca_pt_BR.po')], check=True)
    template = Path(directory) / 'current.pot'
    merged = Path(directory) / 'merged.po'
    subprocess.run(['xgettext', '--keyword=L', '--keyword=_L', '--keyword=_u8L',
                    '--keyword=L_CONTEXT:1,2c', '--keyword=_L_PLURAL:1,2', '--from-code=UTF-8',
                    '--no-location', '--boost', '-f', 'localization/i18n/list.txt', '-o', str(template)],
                   cwd=root, check=True, capture_output=True)
    subprocess.run(['msgmerge', '-N', '--no-fuzzy-matching', '-o', str(merged),
                    str(root / 'localization/i18n/pt_BR/Snapmaker_Orca_pt_BR.po'), str(template)],
                   check=True, capture_output=True)
    missing = subprocess.check_output(['msgattrib', '--untranslated', '--no-obsolete', str(merged)], text=True)
    messages = re.findall(r'^msgid (".*"(?:\n".*")*)', missing, re.M)
    assert not any(''.join(ast.literal_eval(line) for line in block.splitlines()) for block in messages), 'Untranslated messages remain in the current native source list'
    with output.open('rb') as handle:
        catalog = gettext.GNUTranslations(handle)
    assert catalog.gettext('Brazil') == 'Brasil'
    assert catalog.gettext('Prepare') != 'Prepare'
    assert catalog.gettext('Preview') != 'Preview'
print(f'PASS: {count} web values; all keys and placeholders preserved; native catalog compiles; Brazil and primary tabs translated.')
