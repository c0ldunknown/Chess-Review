class ChessAnalysis {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.analyzing = false;
    this.onInfoCallback = null;
    this.onCompleteCallback = null;
    this.currentPositionFen = '';
    this.targetDepth = 15;
    this.cdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';
    this._requestId = 0;
  }

  async init() {
    if (this.isReady) return;

    try {
      // Fetch Stockfish from CDN and create blob URL to bypass CORS for Worker
      const response = await fetch(this.cdnUrl);
      if (!response.ok) throw new Error('Failed to fetch Stockfish from CDN');
      const code = await response.text();
      const blob = new Blob([code], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      
      this.worker = new Worker(workerUrl);
      this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);

      // Initialize UCI
      this.send('uci');
      this.send('isready');
      this.isReady = true;
    } catch (err) {
      console.error('Stockfish init error:', err);
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
    this.send('go depth ' + depth);
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
   * Classifies a move based on centipawn drop
   * @param {number} prevScore - Score before move (from White's perspective, in cp)
   * @param {number} postScore - Score after move (from White's perspective, in cp)
   * @param {string} color - Side that made the move ('w' or 'b')
   * @param {boolean} isBestMove - Whether the move played matches Stockfish's top recommended move
   */
  classifyMove(prevScore, postScore, color, isBestMove) {
    if (isBestMove) {
      return { classification: 'Best', symbol: '⭐', classClass: 'move-best', desc: 'The best move' };
    }

    // Calculate change from White's perspective
    const diff = postScore - prevScore;
    
    // We want the loss of advantage for the active player
    // For White: negative diff is a loss of advantage (e.g. +1.5 -> +0.5 is -1.0)
    // For Black: positive diff is a loss of advantage (e.g. -1.5 -> -0.5 is +1.0)
    const loss = color === 'w' ? -diff : diff;

    if (loss <= 0.1) {
      return { classification: 'Excellent', symbol: '🟢', classClass: 'move-excellent', desc: 'An excellent move' };
    } else if (loss <= 0.3) {
      return { classification: 'Good', symbol: '🔵', classClass: 'move-good', desc: 'A good move' };
    } else if (loss <= 0.9) {
      return { classification: 'Inaccuracy', symbol: '🟡', classClass: 'move-inaccuracy', desc: 'An inaccuracy' };
    } else if (loss <= 2.5) {
      return { classification: 'Mistake', symbol: '🟠', classClass: 'move-mistake', desc: 'A mistake' };
    } else {
      return { classification: 'Blunder', symbol: '🔴', classClass: 'move-blunder', desc: 'A blunder!' };
    }
  }
}

window.ChessAnalysis = ChessAnalysis;
