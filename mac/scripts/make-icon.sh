#!/bin/bash
# Makes mac/Resources/AppIcon.icns from the website's logo (client/public/buildflow-logo.png).
#
#   mac/scripts/make-icon.sh [preview.png]
#
# make-icon.swift draws the 1024 × 1024 master (plate, shadow, logo); sips scales it to the ten
# sizes an .icns holds; iconutil packs them. The logo's artwork is 481 × 601 px and is drawn 560 px
# tall on the master, so no size, the 1024 one included, enlarges the source. Run it again only when
# the logo changes; the .icns is committed, so builds don't need this.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGO="$ROOT/../client/public/buildflow-logo.png"
OUT="$ROOT/Resources/AppIcon.icns"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/buildflow-icon.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

swiftc -O -target "$(uname -m)-apple-macos13.0" -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
    "$ROOT/scripts/make-icon.swift" -o "$WORK/make-icon"
"$WORK/make-icon" "$LOGO" "$WORK/master.png"

SET="$WORK/AppIcon.iconset"
mkdir -p "$SET"
for pt in 16 32 128 256 512; do
    sips -z "$pt" "$pt" "$WORK/master.png" --out "$SET/icon_${pt}x${pt}.png" > /dev/null
    px=$((pt * 2))
    sips -z "$px" "$px" "$WORK/master.png" --out "$SET/icon_${pt}x${pt}@2x.png" > /dev/null
done
iconutil -c icns "$SET" -o "$OUT"
if [ -n "${1:-}" ]; then cp "$WORK/master.png" "$1"; echo "Preview: $1"; fi
echo "Wrote $OUT ($(stat -f %z "$OUT") bytes)"
