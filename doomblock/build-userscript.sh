#!/usr/bin/env bash
# Generuje userscript/doomblock.user.js z extension/content.js (jedno źródło kodu).
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
{
  cat <<HDR
// ==UserScript==
// @name         DoomBlock
// @description  Blokuje Rolki na Instagramie i stronę główną TikToka.
// @version      ${VERSION}
// @match        *://instagram.com/*
// @match        *://*.instagram.com/*
// @match        *://tiktok.com/*
// @match        *://*.tiktok.com/*
// @run-at       document-start
// @inject-into  content
// @grant        none
// ==/UserScript==

HDR
  cat extension/content.js
} > userscript/doomblock.user.js
echo "OK: userscript/doomblock.user.js"
