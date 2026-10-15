#!/bin/sh
cd "$(dirname "$0")"
[ -d node_modules/ws ] || npm install
node index.js
