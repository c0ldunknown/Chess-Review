$(document).ready(function () {
  const boardEl = $('#board');
  const pgnInput = $('#pgnInput');
  const loadBtn = $('#loadBtn');
  const showDataCheckbox = $('#showData');
  const dataPanel = $('#dataPanel');
  const gameInfo = $('#gameInfo');
  const moveList = $('#moveList');

  // Navigation controls
  const firstBtn = $('#firstBtn');
  const prevBtn = $('#prevBtn');
  const flipBtn = $('#flipBtn');
  const nextBtn = $('#nextBtn');
  const lastBtn = $('#lastBtn');
  const moveCounter = $('#moveCounter');

  let board = null;
  let currentMoveIndex = -1;
  let moveHistory = [];
  let startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Engine state
  const engine = new ChessAnalysis();
  let engineInitialized = false;
  let isAnalyzingGame = false;
  let analysisQueue = [];
  let analysisIndex = 0;
  let startPositionEval = null;

  // Eval chart
  let evalChartInstance = null;
  let currentChartIndex = 0;

  // Initialize chessboard.js
  function initBoard() {
    board = Chessboard('board', {
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
      position: 'start',
      draggable: false,
      showNotation: true,
    });

    // Set up SVG arrowhead marker
    setupArrowMarker();

    // Resize board to fit container
    $(window).on('resize', function () {
      if (board) board.resize();
    });
  }

  /** Set up the SVG arrowhead marker definition */
  function setupArrowMarker() {
    const svg = document.getElementById('arrowSvg');
    if (!svg) return;
    svg.innerHTML = '<defs>' +
      '<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">' +
        '<polygon points="0 0, 10 3.5, 0 7" class="best-move-arrow-head" />' +
      '</marker>' +
    '</defs>';
  }

  /**
   * Convert a square name (e.g. "e2") to pixel coordinates relative to the board overlays container.
   * Accounts for the board's flip state automatically via DOM positions.
   * @param {string} square - Square name like "e2"
   * @returns {{x: number, y: number}} Center pixel coordinates
   */
  function getSquareCenter(square) {
    const boardEl = document.getElementById('board');
    const squareEl = boardEl.querySelector('.square-' + square);
    if (!squareEl) return { x: 0, y: 0 };

    const boardRect = boardEl.getBoundingClientRect();
    const squareRect = squareEl.getBoundingClientRect();

    return {
      x: squareRect.left - boardRect.left + squareRect.width / 2,
      y: squareRect.top - boardRect.top + squareRect.height / 2,
    };
  }

  /**
   * Render a classification badge in the top right corner of the destination square.
   * The badge shows the classification symbol (⭐, 🟢, 🔵, 🟡, 🟠, 🔴).
   */
  function renderPieceBadge() {
    const container = document.getElementById('badgeContainer');
    if (!container) return;
    container.innerHTML = '';

    if (currentMoveIndex < 0 || currentMoveIndex >= moveHistory.length) return;

    const move = moveHistory[currentMoveIndex];
    if (!move.classification) return;

    const toSquare = move.uci.substring(2, 4);
    if (!toSquare) return;

    // Get pixel position of the destination square
    const boardEl = document.getElementById('board');
    const squareEl = boardEl.querySelector('.square-' + toSquare);
    if (!squareEl) return;

    const boardRect = boardEl.getBoundingClientRect();
    const squareRect = squareEl.getBoundingClientRect();

    // Top-right corner of the square (relative to the board overlays container)
    const x = squareRect.left - boardRect.left + squareRect.width;
    const y = squareRect.top - boardRect.top;

    const badge = document.createElement('div');
    badge.className = 'piece-badge ' + move.classification.classClass;
    badge.textContent = move.classification.symbol;
    badge.title = move.classification.classification + ': ' + move.classification.desc;

    // Position in top right corner of the square
    badge.style.left = x + 'px';
    badge.style.top = y + 'px';

    container.appendChild(badge);
  }

  /**
   * Render a best-move arrow on the board.
   * Draws an SVG arrow from the source square to the target square of the engine's recommended best move.
   */
  function renderBestMoveArrow() {
    const svg = document.getElementById('arrowSvg');
    if (!svg) return;

    // Clear existing arrows (keep defs)
    const existingArrows = svg.querySelectorAll('.best-move-arrow');
    existingArrows.forEach(function(el) { el.remove(); });

    if (currentMoveIndex < 0 || currentMoveIndex >= moveHistory.length) return;

    const move = moveHistory[currentMoveIndex];
    const bestMove = move.bestMove;
    if (!bestMove || bestMove.length < 4) return;

    const fromSquare = bestMove.substring(0, 2);
    const toSquare = bestMove.substring(2, 4);

    const fromCenter = getSquareCenter(fromSquare);
    const toCenter = getSquareCenter(toSquare);

    if (fromCenter.x === 0 && fromCenter.y === 0) return;
    if (toCenter.x === 0 && toCenter.y === 0) return;

    // Calculate a slight curve offset for a nicer arrow
    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;
    const midX = (fromCenter.x + toCenter.x) / 2;
    const midY = (fromCenter.y + toCenter.y) / 2;
    // Perpendicular offset for curve (small)
    const len = Math.sqrt(dx * dx + dy * dy);
    const offset = Math.min(len * 0.15, 15);
    const perpX = -dy / len * offset;
    const perpY = dx / len * offset;

    // Create a curved path (quadratic bezier)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M ' + fromCenter.x + ' ' + fromCenter.y + ' Q ' + (midX + perpX) + ' ' + (midY + perpY) + ' ' + toCenter.x + ' ' + toCenter.y);
    path.classList.add('best-move-arrow');
    svg.appendChild(path);
  }

  /**
   * Hide/clear all board overlays (badges and arrows).
   */
  function hideOverlays() {
    const badgeContainer = document.getElementById('badgeContainer');
    if (badgeContainer) badgeContainer.innerHTML = '';

    const svg = document.getElementById('arrowSvg');
    if (svg) {
      const existingArrows = svg.querySelectorAll('.best-move-arrow');
      existingArrows.forEach(function(el) { el.remove(); });
    }
  }

  // Lazy-initialize the Stockfish engine
  async function initEngine() {
    if (engineInitialized) return;
    try {
      setLoading(true);
      await engine.init();
      engineInitialized = true;
      setLoading(false);
    } catch (err) {
      showError('Could not load Stockfish engine.');
      setLoading(false);
    }
  }

  // Show error message
  function showError(message) {
    const existing = $('.error-message');
    if (existing.length) existing.remove();

    $('<p class="error-message"></p>')
      .text(message)
      .appendTo('.input-group')
      .delay(3000)
      .fadeOut(300, function () { $(this).remove(); });
  }

  // Set loading state
  function setLoading(isLoading) {
    loadBtn.prop('disabled', isLoading);
    loadBtn.html(isLoading
      ? '<span class="loading-spinner"></span> Loading...'
      : 'Load Game'
    );
  }

  // Update navigation button states and move counter
  function updateNavState() {
    const total = moveHistory.length;
    const current = currentMoveIndex;

    firstBtn.prop('disabled', current <= -1);
    prevBtn.prop('disabled', current <= -1);
    nextBtn.prop('disabled', current >= total - 1);
    lastBtn.prop('disabled', current >= total - 1);

    moveCounter.text((current + 1) + ' / ' + total);
  }

  // Parse PGN string into game details
  function parsePgn(pgnStr) {
    const chess = new Chess();
    chess.loadPgn(pgnStr);
    const header = chess.header();

    // Get move history with FEN positions
    const fullHistory = chess.history({ verbose: true });
    
    let parsedStartFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (header.FEN) {
      parsedStartFen = header.FEN;
    }

    return {
      header: header,
      startFen: parsedStartFen,
      moves: fullHistory.map(function(m, i) {
        return {
          num: Math.floor(i / 2) + 1,
          color: m.color,
          san: m.san,
          uci: m.from + m.to + (m.promotion || ''),
          fen: m.after,
          beforeFen: m.before || (i === 0 ? parsedStartFen : fullHistory[i - 1].after)
        };
      }),
      pgn: pgnStr,
    };
  }

  // Build game info display
  function displayGameInfo(parsed) {
    const h = parsed.header;
    const result = h.Result || '*';
    const white = h.White || 'White';
    const black = h.Black || 'Black';
    const date = h.Date || 'Unknown';
    const eco = h.ECO || '';
    const event = h.Event || '';

    gameInfo.empty();

    const details = [
      { label: 'Event', value: event },
      { label: 'White', value: white },
      { label: 'Black', value: black },
      { label: 'Result', value: result },
      { label: 'Date', value: date },
    ];

    if (eco) details.push({ label: 'ECO', value: eco });

    details.forEach(function(d) {
      if (!d.value) return;
      $('<p class="game-detail"></p>')
        .html('<strong>' + d.label + ':</strong> ' + d.value)
        .appendTo(gameInfo);
    });
  }

  // Build move list with optional classification badges
  function displayMoveList(parsed) {
    moveList.empty();

    $('<h3>Moves</h3>').appendTo(moveList);

    const grid = $('<div class="moves-grid"></div>').appendTo(moveList);

    parsed.moves.forEach(function(move, i) {
      const badge = move.classification 
        ? '<span class="move-badge ' + move.classification.classClass + '" title="' + move.classification.classification + ': ' + move.classification.desc + '">' + move.classification.symbol + '</span>' 
        : '';

      if (move.color === 'w') {
        const numCell = $('<div class="move-number">' + move.num + '.</div>');
        const whiteCell = $(
          '<div class="move-white" data-index="' + i + '">' + move.san + ' ' + badge + '</div>'
        );
        grid.append(numCell, whiteCell);
      } else {
        const blackCell = $(
          '<div class="move-black" data-index="' + i + '">' + move.san + ' ' + badge + '</div>'
        );
        grid.append(blackCell);
      }
    });

    // Click handler for moves
    grid.on('click', '.move-white, .move-black', function () {
      const index = parseInt($(this).data('index'));
      goToMove(index);
    });
  }

  // Format UCI moves to a prettier form
  function formatUciMove(uci) {
    if (!uci || uci.length < 4) return uci;
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promo = uci.substring(4);
    return from + ' → ' + to + (promo ? ' (' + promo.toUpperCase() + ')' : '');
  }

  // Map Centipawn/Mate Score to Eval Bar Percentage (0% for Black win, 100% for White win)
  function scoreToPercentage(score, scoreType) {
    if (scoreType === 'mate') {
      return score > 0 ? 100 : 0;
    }
    const pawns = score / 100;
    const clamped = Math.max(-8, Math.min(8, pawns));
    return ((clamped + 8) / 16) * 100;
  }

  // Update evaluation bar and text status
  function updateEvalUI(score, scoreType, bestMove = '') {
    let text = '0.0';
    if (scoreType === 'mate') {
      text = score > 0 ? 'M' + score : '-M' + Math.abs(score);
    } else {
      const pawns = (score / 100).toFixed(2);
      text = score > 0 ? '+' + pawns : pawns;
    }
    
    $('#evalScore').text(text);
    $('#evalBarText').text(text);

    const percent = scoreToPercentage(score, scoreType);
    $('#evalBarFill').css('height', percent + '%');
    
    if (bestMove) {
      $('#bestMoveText').text(bestMove);
    } else {
      $('#bestMoveText').text('-');
    }
  }

  // Update chart position marker to reflect current move
  function updateChartPosition() {
    if (!evalChartInstance) return;
    const newIndex = currentMoveIndex + 1;
    if (newIndex !== currentChartIndex) {
      currentChartIndex = newIndex;
      evalChartInstance.draw();
    }
  }

  // Navigate to a specific move
  function goToMove(index) {
    if (!moveHistory || moveHistory.length === 0) return;
    if (index < -1 || index >= moveHistory.length) return;

    currentMoveIndex = index;

    // Handle Start Position
    if (currentMoveIndex === -1) {
      board.position('start');
      $('.move-white, .move-black').removeClass('active');
      hideOverlays();
      
      if (engineInitialized && !isAnalyzingGame) {
        const depth = parseInt($('#depthSelect').val()) || 15;
        if (startPositionEval) {
          updateEvalUI(startPositionEval.score, startPositionEval.scoreType, formatUciMove(startPositionEval.bestMove));
        } else {
          let lastScore = 0;
          let lastScoreType = 'cp';
          engine.analyzePosition(
            startFen,
            depth,
            function(info) {
              if (info.scoreType) {
                lastScore = info.score;
                lastScoreType = info.scoreType;
                updateEvalUI(info.score, info.scoreType);
              }
            },
            function(bestMove) {
              startPositionEval = { score: lastScore, scoreType: lastScoreType, bestMove };
              updateEvalUI(lastScore, lastScoreType, formatUciMove(bestMove));
            }
          );
        }
      } else if (startPositionEval) {
        updateEvalUI(startPositionEval.score, startPositionEval.scoreType, formatUciMove(startPositionEval.bestMove));
      } else {
        updateEvalUI(35, 'cp', ''); // Default starting position slightly white (+0.35)
      }
      
      updateNavState();
      return;
    }

    const parsed = moveHistory[currentMoveIndex];

    // Update board
    board.position(parsed.fen);

    // Highlight active move
    $('.move-white, .move-black').removeClass('active');
    const activeEls = $('.move-white[data-index="' + index + '"], .move-black[data-index="' + index + '"]');
    activeEls.addClass('active');

    // Render overlays for this move
    renderPieceBadge();
    renderBestMoveArrow();

    // Trigger analysis or display cached analysis for current move
    if (engineInitialized && !isAnalyzingGame) {
      const depth = parseInt($('#depthSelect').val()) || 15;
      
      if (parsed.eval !== undefined) {
        updateEvalUI(parsed.eval, parsed.evalType, formatUciMove(parsed.bestMove));
      } else {
        let lastScore = 0;
        let lastScoreType = 'cp';
        
        engine.analyzePosition(
          parsed.fen,
          depth,
          function(info) {
            if (info.scoreType) {
              lastScore = info.score;
              lastScoreType = info.scoreType;
              updateEvalUI(info.score, info.scoreType);
            }
          },
          function(bestMove) {
            parsed.eval = lastScore;
            parsed.evalType = lastScoreType;
            parsed.bestMove = bestMove;
            updateEvalUI(lastScore, lastScoreType, formatUciMove(bestMove));
          }
        );
      }
    } else if (parsed.eval !== undefined) {
      updateEvalUI(parsed.eval, parsed.evalType, formatUciMove(parsed.bestMove));
    }

    updateNavState();

    // Update chart position marker
    updateChartPosition();
  }

  // Flip Board Board function
  function flipBoard() {
    if (board) {
      board.flip();
    }
  }

  // Full Game Analysis Queue Management
  async function startFullAnalysis() {
    if (moveHistory.length === 0) {
      showError('Please load a game first.');
      return;
    }
    if (isAnalyzingGame) {
      stopFullAnalysis();
      return;
    }

    await initEngine();
    if (!engineInitialized) return;

    isAnalyzingGame = true;
    $('#analyzeGameBtn').text('Cancel Analysis');
    $('#analysisProgress').removeClass('hidden');

    const depth = parseInt($('#depthSelect').val()) || 15;
    
    // Build queue of FENs: start position and then all moves
    analysisQueue = [
      { index: -1, fen: startFen }
    ];
    moveHistory.forEach(function(move, i) {
      analysisQueue.push({ index: i, fen: move.fen });
    });

    analysisIndex = 0;
    runNextAnalysisQueueItem(depth);
  }

  function stopFullAnalysis() {
    isAnalyzingGame = false;
    engine.stop();
    $('#analyzeGameBtn').text('Analyze Game');
    $('#analysisProgress').addClass('hidden');
    // Show cached eval if available without re-triggering analysis
    if (currentMoveIndex >= 0 && currentMoveIndex < moveHistory.length) {
      const parsed = moveHistory[currentMoveIndex];
      if (parsed.eval !== undefined) {
        updateEvalUI(parsed.eval, parsed.evalType, formatUciMove(parsed.bestMove));
      }
      renderPieceBadge();
      renderBestMoveArrow();
    } else if (currentMoveIndex === -1 && startPositionEval) {
      updateEvalUI(startPositionEval.score, startPositionEval.scoreType, formatUciMove(startPositionEval.bestMove));
    }
  }

  function runNextAnalysisQueueItem(depth) {
    if (!isAnalyzingGame) return;

    if (analysisIndex >= analysisQueue.length) {
      finishFullAnalysis();
      return;
    }

    const item = analysisQueue[analysisIndex];
    const progressPercent = Math.round((analysisIndex / analysisQueue.length) * 100);
    $('#progressFill').css('width', progressPercent + '%');
    $('#progressText').text('Analyzing position ' + analysisIndex + ' / ' + (analysisQueue.length - 1) + '...');

    // Check if position is terminal (checkmate/stalemate) — skip Stockfish analysis
    const chess = new Chess(item.fen);
    if (chess.isGameOver()) {
      // Terminal position: no need to analyze
      const lastScore = 0;
      const lastScoreType = 'cp';
      const bestMove = '';
      
      if (item.index === -1) {
        startPositionEval = { score: lastScore, scoreType: lastScoreType, bestMove };
      } else {
        moveHistory[item.index].eval = lastScore;
        moveHistory[item.index].evalType = lastScoreType;
        moveHistory[item.index].bestMove = bestMove;
      }

      analysisIndex++;
      setTimeout(function() { runNextAnalysisQueueItem(depth); }, 0);
      return;
    }

    let lastScore = 0;
    let lastScoreType = 'cp';
    let timedOut = false;

    // Safety timeout: if Stockfish doesn't respond within 30s, skip this position
    var timeoutId = setTimeout(function() {
      timedOut = true;
      engine.stop();
      
      if (item.index === -1) {
        startPositionEval = { score: lastScore, scoreType: lastScoreType, bestMove: '' };
      } else {
        moveHistory[item.index].eval = lastScore;
        moveHistory[item.index].evalType = lastScoreType;
        moveHistory[item.index].bestMove = '';
      }

      analysisIndex++;
      runNextAnalysisQueueItem(depth);
    }, 30000);

    engine.analyzePosition(
      item.fen,
      depth,
      function(info) {
        if (info.scoreType) {
          lastScore = info.score;
          lastScoreType = info.scoreType;
          updateEvalUI(info.score, info.scoreType);
        }
      },
      function(bestMove) {
        clearTimeout(timeoutId);
        if (item.index === -1) {
          startPositionEval = { score: lastScore, scoreType: lastScoreType, bestMove };
        } else {
          moveHistory[item.index].eval = lastScore;
          moveHistory[item.index].evalType = lastScoreType;
          moveHistory[item.index].bestMove = bestMove;
        }

        analysisIndex++;
        runNextAnalysisQueueItem(depth);
      }
    );
  }

  function renderEvalChart() {
    if (evalChartInstance) {
      evalChartInstance.destroy();
      evalChartInstance = null;
    }

    const canvas = document.getElementById('evalChart');
    if (!canvas) return;

    // Build data series: start position eval + each move's eval
    const labels = ['Start'];
    const data = [];

    // Start position eval (from White's perspective)
    let startScore = 0;
    if (startPositionEval) {
      startScore = startPositionEval.scoreType === 'mate'
        ? (startPositionEval.score > 0 ? 10000 - startPositionEval.score : -10000 + startPositionEval.score)
        : startPositionEval.score;
    }
    data.push(startScore / 100);

    // Each move's eval
    moveHistory.forEach(function(move, i) {
      const moveLabel = move.num + (move.color === 'w' ? '.' : '...') + ' ' + move.san;
      labels.push(moveLabel);

      let score = move.eval || 0;
      if (move.evalType === 'mate') {
        score = score > 0 ? 10000 - score : -10000 + score;
      }
      data.push(score / 100);
    });

    // Clamp extreme values for better visualization
    const clampedData = data.map(function(v) { return Math.max(-10, Math.min(10, v)); });

    // Classification color map (matches CSS class colors)
    const classificationColors = {
      'move-brilliant': '#9b59b6',
      'move-best': '#f1c40f',
      'move-great': '#1abc9c',
      'move-excellent': '#2ecc71',
      'move-good': '#3498db',
      'move-inaccuracy': '#f39c12',
      'move-miss': '#95a5a6',
      'move-mistake': '#e67e22',
      'move-blunder': '#e74c3c',
    };

    function classificationToColor(classClass, alpha) {
      var base = classificationColors[classClass] || '#4a90d9';
      if (alpha !== undefined) {
        return hexToRgba(base, alpha);
      }
      return base;
    }

    function hexToRgba(hex, alpha) {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
    }

    // Determine colors for each segment based on the move's classification
    const segmentColors = [];
    for (var i = 0; i < moveHistory.length; i++) {
      var move = moveHistory[i];
      var classClass = move.classification ? move.classification.classClass : '';
      segmentColors.push(classificationToColor(classClass, 0.4));
    }

    // Set initial chart position to current move
    currentChartIndex = currentMoveIndex + 1;

    const ctx = canvas.getContext('2d');
    evalChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Evaluation (pawns)',
          data: clampedData,
          borderColor: '#4a90d9',
          backgroundColor: 'rgba(74, 144, 217, 0)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: (function() {
            var colors = ['#4a90d9']; // start position
            for (var i = 0; i < moveHistory.length; i++) {
              var move = moveHistory[i];
              var classClass = move.classification ? move.classification.classClass : '';
              colors.push(classificationToColor(classClass));
            }
            return colors;
          })(),
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          fill: false,
          tension: 0.3,
          spanGaps: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const val = context.parsed.y;
                const sign = val > 0 ? '+' : '';
                var label = 'Evaluation: ' + sign + val.toFixed(2);
                // Append classification if available
                var dataIndex = context.dataIndex;
                if (dataIndex > 0) {
                  var move = moveHistory[dataIndex - 1];
                  if (move && move.classification) {
                    label += ' (' + move.classification.classification + ')';
                  }
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#a0a0c0',
              font: { size: 9 },
              maxRotation: 45,
              autoSkip: true,
              maxTicksLimit: 30,
            },
            grid: {
              color: 'rgba(255,255,255,0.05)',
            }
          },
          y: {
            ticks: {
              color: '#a0a0c0',
              font: { size: 10 },
              callback: function(value) {
                const sign = value > 0 ? '+' : '';
                return sign + value.toFixed(1);
              }
            },
            grid: {
              color: 'rgba(255,255,255,0.08)',
            },
            title: {
              display: true,
              text: 'Pawns',
              color: '#a0a0c0',
              font: { size: 10 },
            }
          }
        },
        elements: {
          line: {
            borderWidth: 2,
          }
        }
      },
      plugins: [{
        id: 'zeroLine',
        beforeDraw: function(chart) {
          const ctx = chart.ctx;
          const chartArea = chart.chartArea;
          const yScale = chart.scales.y;
          const zeroY = yScale.getPixelForValue(0);

          if (zeroY >= chartArea.top && zeroY <= chartArea.bottom) {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(chartArea.left, zeroY);
            ctx.lineTo(chartArea.right, zeroY);
            ctx.stroke();
            ctx.restore();
          }
        }
      }, {
        id: 'segmentFill',
        beforeDraw: function(chart) {
          var ctx = chart.ctx;
          var chartArea = chart.chartArea;
          var yScale = chart.scales.y;
          var meta = chart.getDatasetMeta(0);
          if (!meta || !meta.data || meta.data.length < 2) return;

          ctx.save();
          // Draw filled segments between each pair of consecutive points
          for (var i = 0; i < moveHistory.length; i++) {
            var move = moveHistory[i];
            var classClass = move.classification ? move.classification.classClass : '';
            var color = classificationToColor(classClass, 0.15);

            var p0 = meta.data[i];
            var p1 = meta.data[i + 1];
            if (!p0 || !p1) continue;

            var x0 = p0.x;
            var y0 = p0.y;
            var x1 = p1.x;
            var y1 = p1.y;
            var zeroY = yScale.getPixelForValue(0);

            // Draw a filled polygon from data points down to the zero line
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x1, zeroY);
            ctx.lineTo(x0, zeroY);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
          }
          ctx.restore();
        }
      }, {
        id: 'positionMarker',
        afterDraw: function(chart) {
          const chartArea = chart.chartArea;
          const xScale = chart.scales.x;
          const yScale = chart.scales.y;

          // Get pixel position for the current chart index
          const x = xScale.getPixelForValue(currentChartIndex);
          if (x < chartArea.left || x > chartArea.right) return;

          const top = chartArea.top;
          const bottom = chartArea.bottom;

          ctx.save();
          // Vertical line
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
          ctx.stroke();

          // Small circle at the data point
          const y = yScale.getPixelForValue(clampedData[currentChartIndex]);
          if (y >= top && y <= bottom) {
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#4a90d9';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.restore();
        }
      }]
    });
  }

  function finishFullAnalysis() {
    isAnalyzingGame = false;
    $('#analyzeGameBtn').text('Analyze Game');
    $('#analysisProgress').addClass('hidden');

    classifyAllMoves();

    // Re-render move list to show analysis badges
    displayMoveList({ header: {}, moves: moveHistory });

    // Render the eval chart
    renderEvalChart();

    // Highlight and show eval for the current active move
    goToMove(currentMoveIndex);
  }

  // Build the move summary table
  function buildMoveSummary() {
    const summaryCounts = {};
    const classificationData = [
      { name: 'Brilliant', symbol: '💎' },
      { name: 'Great', symbol: '❗' },
      { name: 'Best', symbol: '⭐' },
      { name: 'Excellent', symbol: '🟢' },
      { name: 'Good', symbol: '🔵' },
      { name: 'Inaccuracy', symbol: '🟡' },
      { name: 'Miss', symbol: '❓' },
      { name: 'Mistake', symbol: '🟠' },
      { name: 'Blunder', symbol: '🔴' }
    ];

    // Initialize counts to 0 for white and black for each category
    classificationData.forEach(function(item) {
      summaryCounts[item.name] = { white: 0, black: 0 };
    });

    // Populate counts from move history by color
    moveHistory.forEach(function(move) {
      if (move.classification && move.classification.classification) {
        const className = move.classification.classification;
        if (summaryCounts[className]) {
          if (move.color === 'w') {
            summaryCounts[className].white++;
          } else if (move.color === 'b') {
            summaryCounts[className].black++;
          }
        }
      }
    });

    // Build HTML for the move summary table
    let summaryHtml = '<table class="summary-table"><thead><tr><th>Move</th><th>White</th><th>Symbol</th><th>Black</th></tr></thead><tbody>';
    let totalWhite = 0;
    let totalBlack = 0;

    classificationData.forEach(function(item) {
      const counts = summaryCounts[item.name];
      const w = counts.white;
      const b = counts.black;
      if (w > 0 || b > 0) {
        summaryHtml += '<tr class="summary-' + item.name.toLowerCase() + '">';
        summaryHtml += '<td>' + item.symbol + ' ' + item.name + '</td>';
        summaryHtml += '<td>' + (w > 0 ? w : '') + '</td>';
        summaryHtml += '<td>' + item.symbol + '</td>';
        summaryHtml += '<td>' + (b > 0 ? b : '') + '</td>';
        summaryHtml += '</tr>';
        totalWhite += w;
        totalBlack += b;
      }
    });

    // Add total row
    summaryHtml += '<tr class="summary-total"><td><strong>Total</strong></td><td><strong>' + totalWhite + '</strong></td><td></td><td><strong>' + totalBlack + '</strong></td></tr>';
    summaryHtml += '</tbody></table>';

    $('#moveSummaryTable').html(summaryHtml);
  }

  function finishFullAnalysis() {
    isAnalyzingGame = false;
    $('#analyzeGameBtn').text('Analyze Game');
    $('#analysisProgress').addClass('hidden');

    classifyAllMoves(); // Ensure moves are classified with all data

    // Re-render move list to show analysis badges
    displayMoveList({ header: {}, moves: moveHistory });

    // Render the eval chart
    renderEvalChart();

    // Build and display the move summary
    buildMoveSummary();

    // Highlight and show eval for the current active move
    goToMove(currentMoveIndex);
  }

  function classifyAllMoves() {
    // ... (rest of classifyAllMoves function remains the same)
    moveHistory.forEach(function(move, i) {
      let prevScore = 0;
      let prevScoreType = 'cp';
      let prevBestMove = '';

      if (i === 0) {
        if (startPositionEval) {
          prevScore = startPositionEval.score;
          prevScoreType = startPositionEval.scoreType;
          prevBestMove = startPositionEval.bestMove;
        }
      } else {
        const prevMove = moveHistory[i - 1];
        prevScore = prevMove.eval || 0;
        prevScoreType = prevMove.evalType || 'cp';
        prevBestMove = prevMove.bestMove || '';
      }

      const postScore = move.eval || 0;
      const postScoreType = move.evalType || 'cp';

      // Standardize scores for classification (mate is treated as +/- 10000 cp)
      let pScore = prevScore;
      if (prevScoreType === 'mate') {
        pScore = prevScore > 0 ? 10000 - prevScore : -10000 + prevScore;
      }
      let currScore = postScore;
      if (postScoreType === 'mate') {
        currScore = postScore > 0 ? 10000 - postScore : -10000 + postScore;
      }

      // Check if move matches best move recommended before it was played
      const isBestMove = prevBestMove && (prevBestMove === move.uci);

      const classification = engine.classifyMove(pScore, currScore, move.color, isBestMove);
      move.classification = classification;
    });
  }

  // Navigation button handlers
  firstBtn.on('click', function () {
    if (moveHistory.length === 0) return;
    goToMove(-1); // Go back to start
  });

  prevBtn.on('click', function () {
    if (moveHistory.length === 0) return;
    if (currentMoveIndex < 0) return;
    goToMove(currentMoveIndex - 1);
  });

  flipBtn.on('click', function () {
    flipBoard();
  });

  nextBtn.on('click', function () {
    if (moveHistory.length === 0) return;
    if (currentMoveIndex >= moveHistory.length - 1) return;
    goToMove(currentMoveIndex + 1);
  });

  lastBtn.on('click', function () {
    if (moveHistory.length === 0) return;
    goToMove(moveHistory.length - 1);
  });

  // Keyboard Arrow Key handling
  $(document).on('keydown', function (e) {
    if (pgnInput.is(':focus')) return;

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      flipBoard();
      return;
    }

    if (!moveHistory || moveHistory.length === 0) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToMove(currentMoveIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToMove(currentMoveIndex - 1);
    }
  });

  // Touch / Swipe handling for Chessboard
  let touchStartX = 0;
  let touchStartY = 0;
  const minSwipeDistance = 40;
  const boardDOM = boardEl[0];

  if (boardDOM) {
    boardDOM.addEventListener('touchstart', function (e) {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }, { passive: true });

    boardDOM.addEventListener('touchmove', function (e) {
      e.preventDefault();
    }, { passive: false });

    boardDOM.addEventListener('touchend', function (e) {
      if (!moveHistory || moveHistory.length === 0) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
        e.preventDefault();
        if (deltaX < 0) {
          goToMove(currentMoveIndex + 1);
        } else {
          goToMove(currentMoveIndex - 1);
        }
      }
    }, { passive: false });
  }

  // Load game from PGN text
  function loadGame(pgnText) {
    if (!pgnText || typeof pgnText !== 'string') {
      showError('Please paste a PGN.');
      return;
    }

    const trimmed = pgnText.trim();
    if (!trimmed) {
      showError('Please paste a PGN.');
      return;
    }

    // Destroy existing chart
    if (evalChartInstance) {
      evalChartInstance.destroy();
      evalChartInstance = null;
    }

    gameInfo.empty();
    moveList.empty();
    board.position('start');
    currentMoveIndex = -1;
    startPositionEval = null;

    try {
      const parsed = parsePgn(trimmed);

      if (!parsed.moves || parsed.moves.length === 0) {
        throw new Error('No moves found in PGN. Make sure it contains valid chess moves.');
      }

      moveHistory = parsed.moves;
      startFen = parsed.startFen;

      displayGameInfo(parsed);
      displayMoveList(parsed);

      board.position('start');
      updateNavState();

      // Lazy-init engine and analyze start position
      initEngine().then(function() {
        goToMove(-1);
      });

    } catch (err) {
      showError('Failed to load game: ' + err.message);
      console.error('Load error:', err);
    }
  }

  // Show Data toggle
  showDataCheckbox.on('change', function () {
    if ($(this).is(':checked')) {
      dataPanel.removeClass('hidden');
    } else {
      dataPanel.addClass('hidden');
    }
  });

  // Load button click
  loadBtn.on('click', function () {
    const pgn = pgnInput.val();
    loadGame(pgn);
  });

  // Ctrl+Enter / Cmd+Enter in textarea
  pgnInput.on('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      loadBtn.click();
    }
  });

  // Analyze Game Button click
  $('#analyzeGameBtn').on('click', function () {
    startFullAnalysis();
  });

  // Initialize Board
  initBoard();
  dataPanel.removeClass('hidden');

  // Load initial value inside textarea if any
  const initialPgn = pgnInput.val();
  if (initialPgn) {
    loadGame(initialPgn);
  }
});