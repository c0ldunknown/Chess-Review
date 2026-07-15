// Chess Review — Stockfish 18 WASM Worker
// Loaded by analysis.js as a Web Worker.
// Loads stockfish-18-lite-single from CDN and bridges UCI communication.

importScripts('https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js');

// The module auto-initializes in Worker context.
// After importScripts, it sets up onmessage for UCI commands
// and uses postMessage for engine output.
// The WASM binary is resolved relative to our origin.
