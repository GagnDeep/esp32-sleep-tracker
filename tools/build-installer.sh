#!/usr/bin/env bash
# Build a merged firmware image for the ESP Web Tools installer.
#
# Output: docs/installer/merged.bin (everything from offset 0 — bootloader,
# partitions, otadata, app, LittleFS — concatenated into one flashable file).
# The installer page references this via its manifest.json.
#
# Usage:  tools/build-installer.sh [esp32c3|esp32dev]
set -euo pipefail

ENV="${1:-esp32c3}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/.pio/build/$ENV"
OUT_DIR="$ROOT/docs/installer"
OUT="$OUT_DIR/merged.bin"

case "$ENV" in
  esp32c3)  CHIP=esp32c3 ;;
  esp32dev) CHIP=esp32   ;;
  *) echo "unknown env: $ENV" >&2; exit 1 ;;
esac

echo "[+] building $ENV firmware + filesystem"
( cd "$ROOT" && pio run -e "$ENV" -s )
( cd "$ROOT" && pio run -e "$ENV" -s -t buildfs )

BOOT_APP0="$HOME/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"
BOOTLOADER="$BUILD/bootloader.bin"
PARTITIONS="$BUILD/partitions.bin"
APP="$BUILD/firmware.bin"
LFS="$BUILD/littlefs.bin"

for f in "$BOOTLOADER" "$PARTITIONS" "$BOOT_APP0" "$APP" "$LFS"; do
  [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
done

mkdir -p "$OUT_DIR"

# Offsets MUST match firmware/partitions_custom.csv:
#   nvs     0x09000  (skipped — NVS is empty on first boot, the chip wipes it)
#   otadata 0x0e000  -> boot_app0 (marks app0 as runnable)
#   app0    0x10000  -> firmware
#   spiffs  0x370000 -> littlefs image
echo "[+] merging into $OUT"
uv tool run --from esptool esptool \
  --chip "$CHIP" merge-bin \
  --output "$OUT" \
  --flash-mode dio \
  --flash-freq 80m \
  --flash-size 4MB \
  0x0000   "$BOOTLOADER" \
  0x8000   "$PARTITIONS" \
  0xe000   "$BOOT_APP0" \
  0x10000  "$APP" \
  0x370000 "$LFS"

ls -lh "$OUT"
echo "[+] done"
