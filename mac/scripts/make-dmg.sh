#!/bin/bash
# Packs BuildFlow.app into BuildFlow-<version>.dmg: a compressed (UDZO) disk image holding the app
# and a link to /Applications, so opening it shows the usual drag-to-install window.
#
#   mac/scripts/make-dmg.sh <BuildFlow.app> <output folder>     # prints the DMG's path last
#
# With DEVELOPER_ID set the image itself is signed too (Gatekeeper checks a downloaded DMG before it
# mounts it). release.sh notarizes and staples it after this, when NOTARY_PROFILE is set.
set -euo pipefail

APP="$(cd "${1:?usage: make-dmg.sh <BuildFlow.app> <output folder>}" && pwd)"
OUT_DIR="$(cd "${2:?usage: make-dmg.sh <BuildFlow.app> <output folder>}" && pwd)"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"
DMG="$OUT_DIR/BuildFlow-$VERSION.dmg"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/buildflow-dmg.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/BuildFlow.app"
ln -s /Applications "$STAGE/Applications"

rm -f "$DMG"
hdiutil create -quiet -volname "BuildFlow" -srcfolder "$STAGE" -fs HFS+ \
    -format UDZO -imagekey zlib-level=9 -ov "$DMG"
if [ -n "${DEVELOPER_ID:-}" ]; then
    codesign --force --sign "$DEVELOPER_ID" --timestamp "$DMG"
fi
hdiutil verify -quiet "$DMG"
echo "$DMG"
