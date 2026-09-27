#!/bin/bash
# Makes mac/Resources/BuildFlowMark.png, the small mark in the notch's black band, from the
# website's logo (client/public/buildflow-logo.png): cropped to its artwork, 96 px tall.
#
#   mac/scripts/make-mark.sh
#
# Run it again only when the logo changes; the PNG is committed, so builds don't need this.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGO="$ROOT/../client/public/buildflow-logo.png"
OUT="$ROOT/Resources/BuildFlowMark.png"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/buildflow-mark.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

swiftc -O -target "$(uname -m)-apple-macos13.0" -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
    "$ROOT/scripts/make-mark.swift" -o "$WORK/make-mark"
"$WORK/make-mark" "$LOGO" "$OUT" 96
echo "Wrote $OUT ($(stat -f %z "$OUT") bytes)"
