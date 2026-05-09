#pragma once

// Static placeholder. A future build script can regenerate this from the
// git short SHA at compile time; for now we ship a literal so /api/status
// always has something to report.
#define FIRMWARE_VERSION "0.3.0-dev"
#define FIRMWARE_BUILD_DATE __DATE__ " " __TIME__
