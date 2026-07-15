// Chess Review — Main Orchestration
// UI event wiring and top-level application logic

(function () {
  const R = window.ChessReview;
  R.engine = new ChessAnalysis();

  // DOM references
  const $pgnInput = $('#pgnInput');
  const $loadBtn = $('#loadBtn');
  const $showData = $('#showData');
  const $dataPanel = $('#dataPanel');
  const $gameInfo = $('#gameInfo');
  const $moveList = $('#moveList');

  // --- Helpers ---

  function showError(message) {
    var el = $('.error-message');
    if (el.length) el.remove();
    $('<p class="error-message"></p>')
      .text(message)
      .appendTo('.input-group')
      .delay(3000)
      .fadeOut(300, function () { $(this).remove(); });
  }

  function setLoading(isLoading) {
    $loadBtn.prop('disabled', isLoading);
    $loadBtn.html(isLoading
      ? '<span class="loading-spinner"></span> Loading...'
      : 'Load Game'
    );
  }

  function formatUciMove(uci) {
    if (!uci || uci.length < 4) return uci;
    var from = uci.substring(0, 2);
    var to = uci.substring(2, 4);
    var promo = uci.substring(4);
    return from + ' \u2192 ' + to + (promo ? ' (' + promo.toUpperCase() + ')' : '');
  }
  R.formatUciMove = formatUciMove;

  function scoreToPercentage(score, scoreType) {
    if (scoreType === 'mate') {
      return score > 0 ? 100 : 0;
    }
    var pawns = score / 100;
    var clamped = Math.max(-8, Math.min(8, pawns));
    return ((clamped + 8) / 16) * 100;
  }

  function updateEvalUI(score, scoreType, bestMove) {
    if (bestMove === undefined) bestMove = '';
    var text = '0.0';
    if (scoreType === 'mate') {
      text = score > 0 ? 'M' + score : '-M' + Math.abs(score);
    } else {
      var pawns = (score / 100).toFixed(2);
      text = score > 0 ? '+' + pawns : pawns;
    }

    $('#evalScore').text(text);
    $('#evalBarText').text(text);

    var percent = scoreToPercentage(score, scoreType);
    $('#evalBarFill').css('height', percent + '%');
    $('#bestMoveText').text(bestMove || '-');
  }
  R.updateEvalUI = updateEvalUI;

  // --- Engine ---

  async function initEngine() {
    if (R.engineInitialized) return;
    try {
      setLoading(true);
      await R.engine.init();
      R.engineInitialized = true;
      setLoading(false);
    } catch (err) {
      showError('Could not load Stockfish engine.');
      setLoading(false);
    }
  }

  // --- PGN Parsing ---

  function parsePgn(pgnStr) {
    var chess = new Chess();
    chess.loadPgn(pgnStr);
    var header = chess.header();
    var fullHistory = chess.history({ verbose: true });

    var parsedStartFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (header.FEN) {
      parsedStartFen = header.FEN;
    }

    return {
      header: header,
      startFen: parsedStartFen,
      moves: fullHistory.map(function (m, i) {
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

  // --- UI Rendering ---

  function displayGameInfo(parsed) {
    var h = parsed.header;
    var details = [
      { label: 'Event', value: h.Event },
      { label: 'White', value: h.White || 'White' },
      { label: 'Black', value: h.Black || 'Black' },
      { label: 'Result', value: h.Result || '*' },
      { label: 'Date', value: h.Date || 'Unknown' },
    ];
    if (h.ECO) details.push({ label: 'ECO', value: h.ECO });

    $gameInfo.empty();
    details.forEach(function (d) {
      if (!d.value) return;
      $('<p class="game-detail"></p>')
        .html('<strong>' + d.label + ':</strong> ' + d.value)
        .appendTo($gameInfo);
    });
  }

  function displayMoveList(parsed) {
    $moveList.empty();
    $('<h3>Moves</h3>').appendTo($moveList);
    var grid = $('<div class="moves-grid"></div>').appendTo($moveList);

    parsed.moves.forEach(function (move, i) {
      var badge = move.classification
        ? '<span class="move-badge ' + move.classification.classClass + '" title="' + move.classification.classification + ': ' + move.classification.desc + '">' + move.classification.symbol + '</span>'
        : '';

      if (move.color === 'w') {
        grid.append(
          $('<div class="move-number">' + move.num + '.</div>'),
          $('<div class="move-white" data-index="' + i + '">' + move.san + ' ' + badge + '</div>')
        );
      } else {
        grid.append(
          $('<div class="move-black" data-index="' + i + '">' + move.san + ' ' + badge + '</div>')
        );
      }
    });

    grid.on('click', '.move-white, .move-black', function () {
      var index = parseInt($(this).data('index'));
      R.goToMove(index);
    });
  }

  // --- Move Classification ---

  function classifyAllMoves() {
    R.moveHistory.forEach(function (move, i) {
      var prevScore = 0;
      var prevScoreType = 'cp';
      var prevBestMove = '';

      if (i === 0) {
        if (R.startPositionEval) {
          prevScore = R.startPositionEval.score;
          prevScoreType = R.startPositionEval.scoreType;
          prevBestMove = R.startPositionEval.bestMove;
        }
      } else {
        var prevMove = R.moveHistory[i - 1];
        prevScore = prevMove.eval || 0;
        prevScoreType = prevMove.evalType || 'cp';
        prevBestMove = prevMove.bestMove || '';
      }

      var postScore = move.eval || 0;
      var postScoreType = move.evalType || 'cp';

      var pScore = prevScore;
      if (prevScoreType === 'mate') {
        pScore = prevScore > 0 ? 10000 - prevScore : -10000 + prevScore;
      }
      var currScore = postScore;
      if (postScoreType === 'mate') {
        currScore = postScore > 0 ? 10000 - postScore : -10000 + postScore;
      }

      var isBestMove = prevBestMove && (prevBestMove === move.uci);
      move.classification = R.engine.classifyMove(pScore, currScore, move.color, isBestMove);
    });
  }

  // --- Move Summary ---

  function buildMoveSummary() {
    var classificationData = [
      { name: 'Brilliant', symbol: '\uD83D\uDC8E' },
      { name: 'Great', symbol: '\u2757' },
      { name: 'Best', symbol: '\u2B50' },
      { name: 'Excellent', symbol: '\uD83D\uDFE2' },
      { name: 'Good', symbol: '\uD83D\uDD35' },
      { name: 'Inaccuracy', symbol: '\uD83D\uDFE1' },
      { name: 'Miss', symbol: '\u2753' },
      { name: 'Mistake', symbol: '\uD83D\uDFE0' },
      { name: 'Blunder', symbol: '\uD83D\uDD34' }
    ];

    var summaryCounts = {};
    classificationData.forEach(function (item) {
      summaryCounts[item.name] = { white: 0, black: 0 };
    });

    R.moveHistory.forEach(function (move) {
      if (move.classification && move.classification.classification) {
        var className = move.classification.classification;
        if (summaryCounts[className]) {
          if (move.color === 'w') summaryCounts[className].white++;
          else if (move.color === 'b') summaryCounts[className].black++;
        }
      }
    });

    var html = '<table class="summary-table"><thead><tr><th>Move</th><th>White</th><th>Symbol</th><th>Black</th></tr></thead><tbody>';
    var totalWhite = 0;
    var totalBlack = 0;

    classificationData.forEach(function (item) {
      var counts = summaryCounts[item.name];
      var w = counts.white;
      var b = counts.black;
      if (w > 0 || b > 0) {
        html += '<tr class="summary-' + item.name.toLowerCase() + '">';
        html += '<td>' + item.symbol + ' ' + item.name + '</td>';
        html += '<td>' + (w > 0 ? w : '') + '</td>';
        html += '<td>' + item.symbol + '</td>';
        html += '<td>' + (b > 0 ? b : '') + '</td></tr>';
        totalWhite += w;
        totalBlack += b;
      }
    });

    html += '<tr class="summary-total"><td><strong>Total</strong></td><td><strong>' + totalWhite + '</strong></td><td></td><td><strong>' + totalBlack + '</strong></td></tr>';
    html += '</tbody></table>';
    $('#moveSummaryTable').html(html);
  }

  // --- Analysis Queue ---

  function startFullAnalysis() {
    if (R.moveHistory.length === 0) {
      showError('Please load a game first.');
      return;
    }
    if (R.isAnalyzingGame) {
      stopFullAnalysis();
      return;
    }

    initEngine().then(function () {
      if (!R.engineInitialized) return;
      R.isAnalyzingGame = true;
      $('#analyzeGameBtn').text('Cancel Analysis');
      $('#analysisProgress').removeClass('hidden');

      var depth = parseInt($('#depthSelect').val()) || 15;
      R.analysisQueue = [{ index: -1, fen: R.startFen }];
      R.moveHistory.forEach(function (move, i) {
        R.analysisQueue.push({ index: i, fen: move.fen });
      });
      R.analysisIndex = 0;
      runNextAnalysisQueueItem(depth);
    });
  }

  function stopFullAnalysis() {
    R.isAnalyzingGame = false;
    R.engine.stop();
    $('#analyzeGameBtn').text('Analyze Game');
    $('#analysisProgress').addClass('hidden');

    if (R.currentMoveIndex >= 0 && R.currentMoveIndex < R.moveHistory.length) {
      var parsed = R.moveHistory[R.currentMoveIndex];
      if (parsed.eval !== undefined) {
        updateEvalUI(parsed.eval, parsed.evalType, formatUciMove(parsed.bestMove));
      }
      R.renderPieceBadge();
      R.renderBestMoveArrow();
    } else if (R.currentMoveIndex === -1 && R.startPositionEval) {
      updateEvalUI(R.startPositionEval.score, R.startPositionEval.scoreType, formatUciMove(R.startPositionEval.bestMove));
    }
  }

  function runNextAnalysisQueueItem(depth) {
    if (!R.isAnalyzingGame) return;

    if (R.analysisIndex >= R.analysisQueue.length) {
      finishFullAnalysis();
      return;
    }

    var item = R.analysisQueue[R.analysisIndex];
    var pct = Math.round((R.analysisIndex / R.analysisQueue.length) * 100);
    $('#progressFill').css('width', pct + '%');
    $('#progressText').text('Analyzing position ' + R.analysisIndex + ' / ' + (R.analysisQueue.length - 1) + '...');

    // Skip terminal positions
    var chess = new Chess(item.fen);
    if (chess.isGameOver()) {
      if (item.index === -1) {
        R.startPositionEval = { score: 0, scoreType: 'cp', bestMove: '' };
      } else {
        R.moveHistory[item.index].eval = 0;
        R.moveHistory[item.index].evalType = 'cp';
        R.moveHistory[item.index].bestMove = '';
      }
      R.analysisIndex++;
      setTimeout(function () { runNextAnalysisQueueItem(depth); }, 0);
      return;
    }

    var lastScore = 0;
    var lastScoreType = 'cp';
    var timedOut = false;

    var timeoutId = setTimeout(function () {
      timedOut = true;
      R.engine.stop();
      if (item.index === -1) {
        R.startPositionEval = { score: lastScore, scoreType: lastScoreType, bestMove: '' };
      } else {
        R.moveHistory[item.index].eval = lastScore;
        R.moveHistory[item.index].evalType = lastScoreType;
        R.moveHistory[item.index].bestMove = '';
      }
      R.analysisIndex++;
      runNextAnalysisQueueItem(depth);
    }, 30000);

    R.engine.analyzePosition(
      item.fen,
      depth,
      function (info) {
        if (info.scoreType) {
          lastScore = info.score;
          lastScoreType = info.scoreType;
          updateEvalUI(info.score, info.scoreType);
        }
      },
      function (bestMove) {
        clearTimeout(timeoutId);
        if (item.index === -1) {
          R.startPositionEval = { score: lastScore, scoreType: lastScoreType, bestMove: bestMove };
        } else {
          R.moveHistory[item.index].eval = lastScore;
          R.moveHistory[item.index].evalType = lastScoreType;
          R.moveHistory[item.index].bestMove = bestMove;
        }
        R.analysisIndex++;
        runNextAnalysisQueueItem(depth);
      }
    );
  }

  // --- Explanation Panel ---

  /** Show the current move's explanation from cache (or empty text). */
  function updateExplanationPanel() {
    var textEl = $('#explanationText');

    if (R.currentMoveIndex < 0 || R.currentMoveIndex >= R.moveHistory.length) {
      textEl.text('No game loaded yet.');
      return;
    }

    var move = R.moveHistory[R.currentMoveIndex];
    if (!move.classification) {
      textEl.text('');
      return;
    }

    var classification = move.classification.classification;
    if (classification !== 'Blunder' && classification !== 'Mistake') {
      textEl.text('');
      return;
    }

    if (classification === 'Mistake' && !R.explainMistakes) {
      textEl.text('');
      return;
    }

    // Respect filter
    if (R.errorFilter !== 'both' && move.color !== R.errorFilter) {
      textEl.text('');
      return;
    }

    var cacheKey = classification.toLowerCase() + ':' + move.uci;
    if (R.explanationCache[cacheKey]) {
      textEl.text(R.explanationCache[cacheKey]);
    } else {
      textEl.text('Generating explanation...');
    }
  }
  R.updateExplanationPanel = updateExplanationPanel;

  /** Preload explanations for all blunders/mistakes regardless of filter. */
  function preloadExplanations() {
    var errorMoves = [];
    R.moveHistory.forEach(function (move, i) {
      if (!move.classification) return;
      var c = move.classification.classification;
      if (c !== 'Blunder' && (c !== 'Mistake' || !R.explainMistakes)) return;
      errorMoves.push({ index: i, move: move, classification: c });
    });

    if (errorMoves.length === 0) {
      $('#explanationText').text('No blunders or mistakes to analyze.');
      return;
    }

    $('#analysisProgress').removeClass('hidden');
    var done = 0;

    function fetchNext() {
      if (done >= errorMoves.length) {
        $('#analysisProgress').addClass('hidden');
        $('#analyzeGameBtn').text('Analyze Game');
        R.updateExplanationPanel();
        return;
      }

      var item = errorMoves[done];
      var cacheKey = item.classification.toLowerCase() + ':' + item.move.uci;

      // Skip if already cached
      if (R.explanationCache[cacheKey]) {
        done++;
        fetchNext();
        return;
      }

      var pct = Math.round((done / errorMoves.length) * 100);
      $('#progressFill').css('width', pct + '%');
      $('#progressText').text('Generating explanations ' + (done + 1) + ' / ' + errorMoves.length + '...');

      $.ajax({
        url: 'http://localhost:3001/api/explain',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          move: item.move.san,
          bestMove: formatUciMove(item.move.bestMove) || '',
          classification: item.classification.toLowerCase(),
          fen: item.move.fen
        }),
        success: function (response) {
          if (response.explanation) {
            R.explanationCache[cacheKey] = response.explanation;
          }
        },
        error: function () {
          R.explanationCache[cacheKey] = 'Could not load explanation.';
        },
        complete: function () {
          done++;
          fetchNext();
        }
      });
    }

    fetchNext();
  }

  function finishFullAnalysis() {
    R.isAnalyzingGame = false;
    $('#analyzeGameBtn').text('Analyze Game');
    $('#analysisProgress').removeClass('hidden');
    $('#progressFill').css('width', '0%');
    $('#progressText').text('Generating explanations...');

    classifyAllMoves();

    displayMoveList({ header: {}, moves: R.moveHistory });
    R.renderEvalChart();
    buildMoveSummary();
    R.goToMove(R.currentMoveIndex);

    preloadExplanations();
  }

  // --- Game Loading ---

  function loadGame(pgnText) {
    if (!pgnText || typeof pgnText !== 'string') {
      showError('Please paste a PGN.');
      return;
    }

    var trimmed = pgnText.trim();
    if (!trimmed) {
      showError('Please paste a PGN.');
      return;
    }

    if (R.evalChartInstance) {
      R.evalChartInstance.destroy();
      R.evalChartInstance = null;
    }

    $gameInfo.empty();
    $moveList.empty();
    R.board.position('start');
    R.currentMoveIndex = -1;
    R.startPositionEval = null;

    try {
      var parsed = parsePgn(trimmed);
      if (!parsed.moves || parsed.moves.length === 0) {
        throw new Error('No moves found in PGN. Make sure it contains valid chess moves.');
      }

      R.moveHistory = parsed.moves;
      R.startFen = parsed.startFen;

      displayGameInfo(parsed);
      displayMoveList(parsed);

      R.board.position('start');
      R.updateNavState();

      initEngine().then(function () {
        R.goToMove(-1);
      });
    } catch (err) {
      showError('Failed to load game: ' + err.message);
      console.error('Load error:', err);
    }
  }

  // --- Event Wiring ---

  // Navigation buttons
  $('#firstBtn').on('click', function () {
    if (R.moveHistory.length === 0) return;
    R.goToMove(-1);
  });
  $('#prevBtn').on('click', function () {
    if (R.moveHistory.length === 0 || R.currentMoveIndex < 0) return;
    R.goToMove(R.currentMoveIndex - 1);
  });
  $('#nextBtn').on('click', function () {
    if (R.moveHistory.length === 0 || R.currentMoveIndex >= R.moveHistory.length - 1) return;
    R.goToMove(R.currentMoveIndex + 1);
  });
  $('#lastBtn').on('click', function () {
    if (R.moveHistory.length === 0) return;
    R.goToMove(R.moveHistory.length - 1);
  });
  $('#prevErrorBtn').on('click', function () {
    R.goToPrevError();
  });
  $('#nextErrorBtn').on('click', function () {
    R.goToNextError();
  });
  $('#flipBtn').on('click', function () {
    R.flipBoard();
  });

  // Keyboard
  $(document).on('keydown', function (e) {
    if ($pgnInput.is(':focus')) return;

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      R.flipBoard();
      return;
    }
    if (!R.moveHistory || R.moveHistory.length === 0) return;

    if (e.shiftKey && e.key === 'ArrowRight') {
      e.preventDefault();
      R.goToNextError();
    } else if (e.shiftKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      R.goToPrevError();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      R.goToMove(R.currentMoveIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      R.goToMove(R.currentMoveIndex - 1);
    }
  });

  // Touch/swipe
  var touchStartX = 0;
  var touchStartY = 0;
  var minSwipeDistance = 40;
  var boardDOM = document.getElementById('board');
  if (boardDOM) {
    boardDOM.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    boardDOM.addEventListener('touchmove', function (e) {
      e.preventDefault();
    }, { passive: false });
    boardDOM.addEventListener('touchend', function (e) {
      if (!R.moveHistory || R.moveHistory.length === 0) return;
      var touch = e.changedTouches[0];
      var dx = touch.clientX - touchStartX;
      var dy = touch.clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > minSwipeDistance) {
        if (dx < 0) R.goToMove(R.currentMoveIndex + 1);
        else R.goToMove(R.currentMoveIndex - 1);
      }
    }, { passive: false });
  }

  // Show data toggle
  $showData.on('change', function () {
    $dataPanel.toggleClass('hidden', !$(this).is(':checked'));
  });

  // Load game
  $loadBtn.on('click', function () {
    loadGame($pgnInput.val());
  });

  // Ctrl/Cmd+Enter
  $pgnInput.on('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      $loadBtn.click();
    }
  });

  // Error filter
  $('#errorFilter').on('change', function () {
    R.errorFilter = $(this).val();
    R.updateNavState();
    R.updateExplanationPanel();
  });

  // Analyze
  $('#analyzeGameBtn').on('click', function () {
    startFullAnalysis();
  });

  // --- Bootstrap ---

  R.initBoard();
  $dataPanel.removeClass('hidden');

  var initialPgn = $pgnInput.val();
  if (initialPgn) {
    loadGame(initialPgn);
  }
})();