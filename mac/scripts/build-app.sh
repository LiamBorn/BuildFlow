#!/bin/bash
# Builds mac/build/BuildFlow.app from the sources, with no Xcode:
#   1. compiles the app with swiftc (see compile.sh for why not `swift build`),
#   2. assembles the bundle (Info.plist, example inbox, Sacramento + its OFL licence),
#   3. signs it ad hoc (`codesign -s -`), since this Mac has no signing identity yet.
#
#   mac/scripts/build-app.sh            # release build
#   CONFIG=debug mac/scripts/build-app.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${CONFIG:-release}"
APP="$ROOT/build/BuildFlow.app"

BIN="$("$ROOT/scripts/compile.sh" BuildFlowNotch "$CONFIG" | tail -1)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/Fonts"
cp "$BIN" "$APP/Contents/MacOS/BuildFlow"
cp "$ROOT/Resources/Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"
cp "$ROOT/Resources/example-inbox.json" "$APP/Contents/Resources/"
# Bundled fonts, with their licences (the OFL requires Sacramento's to travel with it).
# Without them the greeting falls back to Snell Roundhand, which macOS ships.
shopt -s nullglob
for f in "$ROOT"/Resources/Fonts/*.ttf "$ROOT"/Resources/Fonts/*.otf "$ROOT"/Resources/Fonts/*.txt; do
    cp "$f" "$APP/Contents/Resources/Fonts/"
done
shopt -u nullglob

plutil -lint "$APP/Contents/Info.plist" > /dev/null
codesign --force --sign - --timestamp=none "$APP"
codesign --verify --strict "$APP"

echo "Built $APP ($CONFIG, signed ad hoc)"
