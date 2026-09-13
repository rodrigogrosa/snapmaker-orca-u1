#!/bin/bash
# Reproducible local macOS build using Command Line Tools and Ninja.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "${1:---all}" in
  --deps) target=(-d) ;;
  --app) target=(-s) ;;
  --all) target=() ;;
  *) echo 'Usage: scripts/build_u1_macos.sh [--deps|--app|--all]' >&2; exit 2 ;;
esac
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'This helper requires macOS.' >&2; exit 1
fi
for tool in python3 ninja autoconf automake glibtoolize; do
  if ! command -v "$tool" >/dev/null; then
    echo 'Install build tools first: brew install ninja automake autoconf libtool texinfo gettext' >&2
    exit 1
  fi
done
TOOL_DIR="$ROOT/build/u1-tools"
if [[ ! -x "$TOOL_DIR/bin/cmake" ]]; then
  python3 -m venv "$TOOL_DIR"
  "$TOOL_DIR/bin/python" -m pip install 'cmake==3.31.10'
fi
export PATH="$TOOL_DIR/bin:$PATH"
if command -v brew >/dev/null; then
  export PATH="$(brew --prefix texinfo)/bin:$(brew --prefix gettext)/bin:$PATH"
fi
export CMAKE_BUILD_PARALLEL_LEVEL="${CMAKE_BUILD_PARALLEL_LEVEL:-6}"
cd "$ROOT"
exec ./build_release_macos.sh "${target[@]}" -x -a "$(uname -m)"
