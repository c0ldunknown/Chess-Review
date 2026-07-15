class ChessAnalysis {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.analyzing = false;
    this.onInfoCallback = null;
    this.onCompleteCallback = null;
    this.currentPositionFen = '';
    this.targetDepth = 15;
    this.searchMode = 'time';     // 'depth' or 'time'
    this.searchTime = 8000;       // ms for movetime mode
    this.cdnUrl = 'https://cdn.jsdelivr.net/npm/stockfish.wasm@0.10.0/stockfish.js';
    this._requestId = 0;
  }

  async init() {
    if (this.isReady) return;

    try {
      // Create a Worker that loads stockfish.wasm via importScripts
      // The WASM loader is async, so we need to wait for it to signal ready
      const workerScript = [
        'importScripts("' + this.cdnUrl + '");',
        'Stockfish().then(function(sf) {',
        '  sf.addMessageListener(function(msg) { self.postMessage(msg); });',
        '  self.onmessage = function(e) { sf.postMessage(e.data); };',
        '  self.postMessage("wasm_ready");',
        '}).catch(function(err) {',
        '  self.postMessage("wasm_error:" + err.message);',
        '});'
      ].join('\n');

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);

      this.worker = new Worker(workerUrl);

      // Wait for the Worker to signal WASM is ready
      await new Promise((resolve, reject) => {
        this.worker.onmessage = (e) => {
          const msg = e.data;
          if (msg === 'wasm_ready') {
            // Now set up the normal message handler and resolve
            this.worker.onmessage = (e2) => this.handleWorkerMessage(e2.data);
            resolve();
          } else if (typeof msg === 'string' && msg.startsWith('wasm_error:')) {
            reject(new Error(msg.slice(11)));
          }
        };
      });

      // Initialize UCI — commands flow through the Worker → engine forwarding
      this.send('uci');
      this.send('isready');
      this.isReady = true;
    } catch (err) {
      console.error('Stockfish WASM init error:', err);
      throw err;
    }
  }

  send(cmd) {
    if (this.worker) {
      this.worker.postMessage(cmd);
    }
  }

  stop() {
    if (this.analyzing) {
      this.send('stop');
      this.analyzing = false;
    }
    // Clear callbacks to prevent stale responses from triggering
    this.onInfoCallback = null;
    this.onCompleteCallback = null;
  }

  analyzePosition(fen, depth = 15, onInfo = null, onComplete = null) {
    this.stop();

    this._requestId++;
    const reqId = this._requestId;
    
    this.currentPositionFen = fen;
    this.targetDepth = depth;
    this.onInfoCallback = onInfo ? function(info) {
      if (reqId === this._requestId) onInfo(info);
    }.bind(this) : null;
    this.onCompleteCallback = onComplete ? function(bestMove) {
      if (reqId === this._requestId) onComplete(bestMove);
    }.bind(this) : null;
    this.analyzing = true;

    this.send('position fen ' + fen);
    if (this.searchMode === 'time') {
      this.send('go movetime ' + this.searchTime);
    } else {
      this.send('go depth ' + depth);
    }
  }

  handleWorkerMessage(line) {
    // console.log('[Stockfish]', line);

    if (line.startsWith('info') && this.analyzing) {
      const parsed = this.parseInfoLine(line);
      if (parsed && this.onInfoCallback) {
        try {
          this.onInfoCallback(parsed);
        } catch (e) {
          console.error('Info callback error:', e);
        }
      }
    } else if (line.startsWith('bestmove') && this.analyzing) {
      this.analyzing = false;
      const parts = line.split(' ');
      const bestMove = parts[1];
      if (this.onCompleteCallback) {
        try {
          this.onCompleteCallback(bestMove);
        } catch (e) {
          console.error('Complete callback error:', e);
        }
      }
    }
  }

  parseInfoLine(line) {
    // Example: info depth 10 seldepth 14 score cp 12 nodes 8432 nps 54234 pv e2e4 e7e5
    const parts = line.split(' ');
    
    const depthIdx = parts.indexOf('depth');
    if (depthIdx === -1) return null;
    const depth = parseInt(parts[depthIdx + 1]);

    const scoreIdx = parts.indexOf('score');
    let scoreType = ''; // 'cp' or 'mate'
    let scoreValue = 0;
    
    if (scoreIdx !== -1) {
      scoreType = parts[scoreIdx + 1]; // 'cp' or 'mate'
      scoreValue = parseInt(parts[scoreIdx + 2]);
    }

    // Extract PV (best lines)
    const pvIdx = parts.indexOf('pv');
    let pv = [];
    if (pvIdx !== -1) {
      pv = parts.slice(pvIdx + 1);
    }

    // Determine side to move from FEN to normalize score from White's perspective
    let scoreNormalized = scoreValue;
    const fenParts = this.currentPositionFen.split(' ');
    const sideToMove = fenParts[1] || 'w';

    if (scoreType === 'cp') {
      if (sideToMove === 'b') {
        scoreNormalized = -scoreValue;
      }
    } else if (scoreType === 'mate') {
      if (sideToMove === 'b') {
        scoreNormalized = -scoreValue;
      }
    }

    return {
      depth,
      scoreType,
      score: scoreNormalized,
      pv,
      rawLine: line
    };
  }

  /**
   * Classifies a move based on centipawn drop — similar to Chess.com/lichess categories
   * @param {number} prevScore - Score before move (from White's perspective, in cp)
   * @param {number} postScore - Score after move (from White's perspective, in cp)
   * @param {string} color - Side that made the move ('w' or 'b')
   * @param {boolean} isBestMove - Whether the move played matches Stockfish's top recommended move
   */
  classifyMove(prevScore, postScore, color, isBestMove) {
    // Convert scores to the player's perspective
    // playerPrevScore > 0 = good for the player, < 0 = bad
    const playerPrevScore = color === 'w' ? prevScore : -prevScore;
    const playerPostScore = color === 'w' ? postScore : -postScore;
    const diff = postScore - prevScore;
    const loss = color === 'w' ? -diff : diff;

    if (isBestMove) {
      // Brilliant: best move that turns a losing position around
      // (player was at least 1.5 pawns down and recovered to within 0.5 pawns of equal)
      if (playerPrevScore <= -150 && playerPostScore >= -50) {
        return { classification: 'Brilliant', symbol: '💎', classClass: 'move-brilliant', desc: 'A brilliant move that turns the game around' };
      }
      return { classification: 'Best', symbol: '⭐', classClass: 'move-best', desc: 'The best move' };
    }

    // Non-best moves: classify by centipawn loss from player's perspective
    if (loss <= 5) {
      return { classification: 'Great', symbol: '❗', classClass: 'move-great', desc: 'A great move, almost the best' };
    } else if (loss <= 10) {
      return { classification: 'Excellent', symbol: '🟢', classClass: 'move-excellent', desc: 'An excellent move' };
    } else if (loss <= 30) {
      return { classification: 'Good', symbol: '🔵', classClass: 'move-good', desc: 'A good move' };
    } else if (loss <= 70) {
      return { classification: 'Inaccuracy', symbol: '🟡', classClass: 'move-inaccuracy', desc: 'An inaccuracy' };
    } else if (loss <= 150) {
      return { classification: 'Miss', symbol: '❓', classClass: 'move-miss', desc: 'Missed a good opportunity' };
    } else if (loss <= 250) {
      return { classification: 'Mistake', symbol: '🟠', classClass: 'move-mistake', desc: 'A mistake' };
    } else {
      return { classification: 'Blunder', symbol: '🔴', classClass: 'move-blunder', desc: 'A blunder!' };
    }
  }
}

window.ChessAnalysis = ChessAnalysis;
