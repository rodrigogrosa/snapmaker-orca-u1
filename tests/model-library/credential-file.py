"""Separate binaries/processes; only synthetic credentials in a temporary directory."""
import pathlib, subprocess, tempfile, os, stat
root=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='u1-credentials-test-') as temp:
    base=pathlib.Path(temp); folder=base/'credentials'
    first=base/'version1'; second=base/'version2'
    for binary,flag in [(first,'-O0'),(second,'-O2')]:
        subprocess.run(['c++','-std=c++17',flag,str(root/'tests/model-library/credential-file.cpp'),'-o',str(binary)],check=True)
    def run(action,binary=first): subprocess.run([str(binary),action,str(folder)],check=True)
    run('missing');run('write');run('read',second);run('isolation',second);run('reject-invalid',second)
    assert stat.S_IMODE(folder.stat().st_mode)==0o700
    assert stat.S_IMODE((folder/'thingiverse.token').stat().st_mode)==0o600
    run('disconnect');run('disconnected',second)
    (folder/'thingiverse.token').write_text('bad token')
    run('reject-file');assert (folder/'thingiverse.token').read_text()=='bad token'
    (folder/'thingiverse.token').unlink()
    outside=base/'outside';outside.write_text('untouched')
    (folder/'thingiverse.token').symlink_to(outside)
    run('reject-file');assert outside.read_text()=='untouched'
    print('PASS permissions, corruption preservation, symlink rejection and version-independent storage')
