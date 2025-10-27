#!/bin/bash
cd /home/runner/workspace
git add chrome-extension/content-backend.js chrome-extension/manifest.json CHANGELOG-v16.1.md storylister-v16.1.zip
git commit -m "v16.1: Enhanced media ID detection with 6-layer fallback system"
git push https://colincarrier:${GITHUB_TOKEN}@github.com/colincarrier/storylister.git main