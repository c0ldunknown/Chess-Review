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

    // Resize board to fit container
    $(window).on('resize', function () {
      if (board) board.resize();
    });
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

    moveCounter.text(`${current + 1} / ${total}`);
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
      moves: fullHistory.map((m, i) => ({
        num: Math.floor(i / 2) + 1,
        color: m.color,
        san: m.san,
        uci: m.from + m.to + (m.promotion || ''),
        fen: m.after,
        beforeFen: m.before || (i === 0 ? parsedStartFen : fullHistory[i - 1].after)
      })),
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

    details.forEach((d) => {
      if (!d.value) return;
      $('<p class="game-detail"></p>')
        .html(`<strong>${d.label}:</strong> ${d.value}`)
        .appendTo(gameInfo);
    });
  }

  // Build move list with optional classification badges
  function displayMoveList(parsed) {
    moveList.empty();

    $('<h3>Moves</h3>').appendTo(moveList);

    const grid = $('<div class="moves-grid"></div>').appendTo(moveList);

    parsed.moves.forEach((move, i) => {
      const badge = move.classification 
        ? `<span class="move-badge ${move.classification.classClass}" title="${move.classification.classification}: ${move.classification.desc}">${move.classification.symbol}</span>` 
        : '';

      if (move.color === 'w') {
        const numCell = $(`<div class="move-number">${move.num}.</div>`);
        const whiteCell = $(
          `<div class="move-white" data-index="${i}">${move.san} ${badge}</div>`
        );
        grid.append(numCell, whiteCell);
      } else {
        const blackCell = $(
          `<div class="move-black" data-index="${i}">${move.san} ${badge}</div>`
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
    return `${from} → ${to}${promo ? ` (${promo.toUpperCase()})` : ''}`;
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
      text = score > 0 ? `M${score}` : `-M${Math.abs(score)}`;
    } else {
      const pawns = (score / 100).toFixed(2);
      text = score > 0 ? `+${pawns}` : pawns;
    }
    
    $('#evalScore').text(text);
    $('#evalBarText').text(text);

    const percent = scoreToPercentage(score, scoreType);
    $('#evalBarFill').css('height', `${percent}%`);
    
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
            (info) => {
              if (info.scoreType) {
                lastScore = info.score;
                lastScoreType = info.scoreType;
                updateEvalUI(info.score, info.scoreType);
              }
            },
            (bestMove) => {
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
    const activeEls = $(`.move-white[data-index="${index}"], .move-black[data-index="${index}"]`);
    activeEls.addClass('active');

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
          (info) => {
            if (info.scoreType) {
              lastScore = info.score;
              lastScoreType = info.scoreType;
              updateEvalUI(info.score, info.scoreType);
            }
          },
          (bestMove) => {
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
    moveHistory.forEach((move, i) => {
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
    goToMove(currentMoveIndex);
  }

  function runNextAnalysisQueueItem(depth) {
    if (!isAnalyzingGame) return;

    if (analysisIndex >= analysisQueue.length) {
      finishFullAnalysis();
      return;
    }

    const item = analysisQueue[analysisIndex];
    const progressPercent = Math.round((analysisIndex / analysisQueue.length) * 100);
    $('#progressFill').css('width', `${progressPercent}%`);
    $('#progressText').text(`Analyzing position ${analysisIndex} / ${analysisQueue.length - 1}...`);

    let lastScore = 0;
    let lastScoreType = 'cp';

    engine.analyzePosition(
      item.fen,
      depth,
      (info) => {
        if (info.scoreType) {
          lastScore = info.score;
          lastScoreType = info.scoreType;
          updateEvalUI(info.score, info.scoreType);
        }
      },
      (bestMove) => {
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
    moveHistory.forEach((move, i) => {
      const moveLabel = `${move.num}${move.color === 'w' ? '.' : '...'} ${move.san}`;
      labels.push(moveLabel);

      let score = move.eval || 0;
      if (move.evalType === 'mate') {
        score = score > 0 ? 10000 - score : -10000 + score;
      }
      data.push(score / 100);
    });

    // Clamp extreme values for better visualization
    const clampedData = data.map(v => Math.max(-10, Math.min(10, v)));

    // Determine colors for each segment
    const segmentColors = [];
    for (let i = 0; i < data.length - 1; i++) {
      const diff = data[i + 1] - data[i];
      // For White's moves (odd indices: 1,3,5...), negative diff = losing advantage
      // For Black's moves (even indices: 2,4,6...), positive diff = losing advantage
      // Index 0 is start, index 1 = White's 1st move, index 2 = Black's 1st move, etc.
      const isWhiteMove = i % 2 === 0; // moves at odd labels are White's
      const isLoss = isWhiteMove ? diff < -0.3 : diff > 0.3;
      segmentColors.push(isLoss ? 'rgba(231, 76, 60, 0.6)' : 'rgba(46, 204, 113, 0.6)');
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
          backgroundColor: 'rgba(74, 144, 217, 0.1)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: clampedData.map((v, i) => {
            if (i === 0) return '#4a90d9';
            const prev = clampedData[i - 1];
            const diff = v - prev;
            const isWhiteMove = (i - 1) % 2 === 0;
            const isLoss = isWhiteMove ? diff < -0.3 : diff > 0.3;
            return isLoss ? '#e74c3c' : '#2ecc71';
          }),
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          fill: true,
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
                return `Evaluation: ${sign}${val.toFixed(2)}`;
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
                return `${sign}${value.toFixed(1)}`;
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

  function classifyAllMoves() {
    moveHistory.forEach((move, i) => {
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
      initEngine().then(() => {
        goToMove(-1);
      });

    } catch (err) {
      showError(`Failed to load game: ${err.message}`);
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
