#!/usr/bin/env bash
# Build a merged firmware image for the ESP Web Tools installer.
#
# Output: docs/installer/merged-{esp32,esp32c3}.bin — everything from
# offset 0 (bootloader, partitions, otadata, app, LittleFS) concatenated
# into one flashable file per chip family. The installer page references
# both via its manifest.json so the browser auto-picks by detected chip.
#
# Usage:
#   tools/build-installer.sh                 # builds both envs
#   tools/build-installer.sh esp32dev        # build only the classic ESP32
#   tools/build-installer.sh esp32c3         # build only the ESP32-C3
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/installer"
mkdir -p "$OUT_DIR"

build_one() {
  local ENV="$1"
  local CHIP OUT BUILD
  case "$ENV" in
    esp32c3)  CHIP=esp32c3; OUT="$OUT_DIR/merged-esp32c3.bin" ;;
    esp32dev) CHIP=esp32;   OUT="$OUT_DIR/merged-esp32.bin"   ;;
    *) echo "unknown env: $ENV" >&2; exit 1 ;;
  esac
  BUILD="$ROOT/.pio/build/$ENV"

  echo "[+] building $ENV firmware + filesystem"
  ( cd "$ROOT" && pio run -e "$ENV" -s )
  ( cd "$ROOT" && pio run -e "$ENV" -s -t buildfs )

  local BOOT_APP0="$HOME/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"
  local BOOTLOADER="$BUILD/bootloader.bin"
  local PARTITIONS="$BUILD/partitions.bin"
  local APP="$BUILD/firmware.bin"
  local LFS="$BUILD/littlefs.bin"

  local f
  for f in "$BOOTLOADER" "$PARTITIONS" "$BOOT_APP0" "$APP" "$LFS"; do
    [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
  done

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
}

if [[ $# -eq 0 ]]; then
  build_one esp32dev
  build_one esp32c3
else
  build_one "$1"
fi
echo "[+] done"
