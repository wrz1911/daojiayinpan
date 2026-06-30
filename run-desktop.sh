#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/src-tauri/target/release/app"
