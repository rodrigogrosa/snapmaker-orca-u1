#!/usr/bin/env python3
"""Package the web library with an existing macOS runtime, without rebuilding C++."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import shlex
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True, help='Existing Snapmaker Orca .app (read only)')
parser.add_argument('--output', type=Path, required=True, help='New, separate .app path')
parser.add_argument('--source-build', action='store_true', help='Source is the locally compiled bundle from this fork')
parser.add_argument('--profile', type=Path, required=True, help='Separate development data directory')
args = parser.parse_args()
source, output, profile = (p.expanduser().resolve() for p in (args.source, args.output, args.profile))
repo = Path(__file__).resolve().parents[1]
if output.exists() or source == output or source in output.parents:
    parser.error('Output must be a new path outside the source application.')
if profile == source or source in profile.parents or profile == output or output in profile.parents:
    parser.error('Profile must be outside both application bundles.')
if profile.exists() and not (profile / '.u1-lab-profile').is_file():
    parser.error('Existing profile must have a .u1-lab-profile marker; do not reuse personal profiles.')
info_path = source / 'Contents/Info.plist'
with info_path.open('rb') as handle:
    info = plistlib.load(handle)
exe = info['CFBundleExecutable']
if not (source / 'Contents/MacOS' / exe).is_file():
    parser.error('Source executable not found.')
source_index = source / 'Contents/Resources/web/flutter_web/index.html'
if '</body>' not in source_index.read_text():
    parser.error('Source Flutter entry point not recognized.')
profile.mkdir(parents=True, exist_ok=True)
(profile / '.u1-lab-profile').touch()
output.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['ditto', str(source), str(output)], check=True)
resources = output / 'Contents/Resources'
shutil.copytree(repo / 'resources/web/model-library', resources / 'web/model-library', dirs_exist_ok=True)
index = resources / 'web/flutter_web/index.html'
text = index.read_text()
if '../model-library/library.js' not in text:
    text = text.replace('</body>', '<script src="../model-library/library.js"></script></body>')
index.write_text(text)
launcher = output / 'Contents/MacOS/U1Lab'
launcher.write_text('#!/bin/bash\nset -e\nAPP_BIN="$(cd "$(dirname "$0")" && pwd)"\n'
                    'exec "$APP_BIN"/' + shlex.quote(exe) + ' --datadir ' + shlex.quote(str(profile)) + ' "$@"\n')
launcher.chmod(0o755)
app_name = 'U1 Lab Native' if args.source_build else 'U1 Lab'
bundle_id = 'com.rodrigogrosa.u1lab.native' if args.source_build else 'com.rodrigogrosa.u1lab'
info.update(CFBundleExecutable='U1Lab', CFBundleIdentifier=bundle_id, CFBundleName=app_name, CFBundleDisplayName=app_name)
info.pop('CFBundleURLTypes', None)
info.pop('CFBundleDocumentTypes', None)
with (output / 'Contents/Info.plist').open('wb') as handle:
    plistlib.dump(info, handle)
(resources / 'U1-LAB.txt').write_text(
    'Experimental UI resource build. C++ runtime copied from local Snapmaker Orca '
    + info.get('CFBundleShortVersionString', 'unknown') + '.\n'
    'Source: https://github.com/rodrigogrosa/snapmaker-orca-u1\n'
    + ('Native engine built locally from this fork.\n' if args.source_build else 'The native engine has NOT been rebuilt from this fork.\n'))
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip())
manifest = {
    'repository': 'https://github.com/rodrigogrosa/snapmaker-orca-u1',
    'revision': revision,
    'working_tree_modified': dirty,
    'native_engine_built_from_fork': args.source_build,
    'runtime_version': info.get('CFBundleShortVersionString'),
    'source_executable_sha256': hashlib.sha256((source / 'Contents/MacOS' / exe).read_bytes()).hexdigest(),
}
(resources / 'U1-LAB.json').write_text(json.dumps(manifest, indent=2) + '\n')
subprocess.run(['codesign', '--force', '--deep', '--sign', '-', str(output)], check=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(output)], check=True)
print(f'Created {output}\nRuntime {info.get("CFBundleShortVersionString")}\nProfile {profile}')
