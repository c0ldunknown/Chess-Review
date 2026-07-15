// Chess Review — Board Module
// Board initialization, navigation, overlays

(function () {
  const R = window.ChessReview;

  /** Set up the SVG arrowhead marker definition */
  R.setupArrowMarker = function () {
    const svg = document.getElementById('arrowSvg');
    if (!svg) return;
    svg.innerHTML = '<defs>' +
      '<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">' +
        '<polygon points="0 0, 10 3.5, 0 7" class="best-move-arrow-head" />' +
      '</marker>' +
    '</defs>';
  };

  /** Initialize chessboard.js */
  R.initBoard = function () {
    R.board = Chessboard('board', {
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
      position: 'start',
      draggable: false,
      showNotation: true,
    });

    R.setupArrowMarker();

    $(window).on('resize', function () {
      if (R.board) R.board.resize();
    });
  };

  /**
   * Convert a square name to pixel coordinates relative to the board overlays container.
   * @param {string} square - Square name like "e2"
   * @returns {{x: number, y: number}} Center pixel coordinates
   */
  R.getSquareCenter = function (square) {
    const boardEl = document.getElementById('board');
    const squareEl = boardEl.querySelector('.square-' + square);
    if (!squareEl) return { x: 0, y: 0 };

    const boardRect = boardEl.getBoundingClientRect();
    const squareRect = squareEl.getBoundingClientRect();

    return {
      x: squareRect.left - boardRect.left + squareRect.width / 2,
      y: squareRect.top - boardRect.top + squareRect.height / 2,
    };
  };

  /** Render a classification badge in the top-right corner of the destination square. */
  R.renderPieceBadge = function () {
    const container = document.getElementById('badgeContainer');
    if (!container) return;
    container.innerHTML = '';

    if (R.currentMoveIndex < 0 || R.currentMoveIndex >= R.moveHistory.length) return;

    const move = R.moveHistory[R.currentMoveIndex];
    if (!move.classification) return;

    const toSquare = move.uci.substring(2, 4);
    if (!toSquare) return;

    const boardEl = document.getElementById('board');
    const squareEl = boardEl.querySelector('.square-' + toSquare);
    if (!squareEl) return;

    const boardRect = boardEl.getBoundingClientRect();
    const squareRect = squareEl.getBoundingClientRect();

    const x = squareRect.left - boardRect.left + squareRect.width;
    const y = squareRect.top - boardRect.top;

    const badge = document.createElement('div');
    badge.className = 'piece-badge ' + move.classification.classClass;
    badge.textContent = move.classification.symbol;
    badge.title = move.classification.classification + ': ' + move.classification.desc;

    badge.style.left = x + 'px';
    badge.style.top = y + 'px';

    container.appendChild(badge);
  };

  /** Render a best-move arrow on the board. */
  R.renderBestMoveArrow = function () {
    const svg = document.getElementById('arrowSvg');
    if (!svg) return;

    const existingArrows = svg.querySelectorAll('.best-move-arrow');
    existingArrows.forEach(function (el) { el.remove(); });

    if (R.currentMoveIndex < 0 || R.currentMoveIndex >= R.moveHistory.length) return;

    const move = R.moveHistory[R.currentMoveIndex];
    const bestMove = move.bestMove;
    if (!bestMove || bestMove.length < 4) return;

    const fromSquare = bestMove.substring(0, 2);
    const toSquare = bestMove.substring(2, 4);

    const fromCenter = R.getSquareCenter(fromSquare);
    const toCenter = R.getSquareCenter(toSquare);

    if (fromCenter.x === 0 && fromCenter.y === 0) return;
    if (toCenter.x === 0 && toCenter.y === 0) return;

    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;
    const midX = (fromCenter.x + toCenter.x) / 2;
    const midY = (fromCenter.y + toCenter.y) / 2;
    const len = Math.sqrt(dx * dx + dy * dy);
    const offset = Math.min(len * 0.15, 15);
    const perpX = -dy / len * offset;
    const perpY = dx / len * offset;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M ' + fromCenter.x + ' ' + fromCenter.y + ' Q ' + (midX + perpX) + ' ' + (midY + perpY) + ' ' + toCenter.x + ' ' + toCenter.y);
    path.classList.add('best-move-arrow');
    svg.appendChild(path);
  };

  /** Hide/clear all board overlays. */
  R.hideOverlays = function () {
    const badgeContainer = document.getElementById('badgeContainer');
    if (badgeContainer) badgeContainer.innerHTML = '';

    const svg = document.getElementById('arrowSvg');
    if (svg) {
      const existingArrows = svg.querySelectorAll('.best-move-arrow');
      existingArrows.forEach(function (el) { el.remove(); });
    }
  };

  /** Update chart position marker to reflect current move. */
  R.updateChartPosition = function () {
    if (!R.evalChartInstance) return;
    const newIndex = R.currentMoveIndex + 1;
    if (newIndex !== R.currentChartIndex) {
      R.currentChartIndex = newIndex;
      R.evalChartInstance.draw();
    }
  };

  /** Update navigation button states and move counter. */
  R.updateNavState = function () {
    const total = R.moveHistory.length;
    const current = R.currentMoveIndex;

    $('#firstBtn').prop('disabled', current <= -1);
    $('#prevBtn').prop('disabled', current <= -1);
    $('#nextBtn').prop('disabled', current >= total - 1);
    $('#lastBtn').prop('disabled', current >= total - 1);

    $('#moveCounter').text((current + 1) + ' / ' + total);
  };

  /** Navigate to a specific move. */
  R.goToMove = function (index) {
    if (!R.moveHistory || R.moveHistory.length === 0) return;
    if (index < -1 || index >= R.moveHistory.length) return;

    R.currentMoveIndex = index;

    if (R.currentMoveIndex === -1) {
      R.board.position('start');
      $('.move-white, .move-black').removeClass('active');
      R.hideOverlays();

      if (R.engineInitialized && !R.isAnalyzingGame) {
        const depth = parseInt($('#depthSelect').val()) || 15;
        if (R.startPositionEval) {
          R.updateEvalUI(R.startPositionEval.score, R.startPositionEval.scoreType, R.formatUciMove(R.startPositionEval.bestMove));
        } else {
          var lastScore = 0;
          var lastScoreType = 'cp';
          R.engine.analyzePosition(
            R.startFen,
            depth,
            function (info) {
              if (info.scoreType) {
                lastScore = info.score;
                lastScoreType = info.scoreType;
                R.updateEvalUI(info.score, info.scoreType);
              }
            },
            function (bestMove) {
              R.startPositionEval = { score: lastScore, scoreType: lastScoreType, bestMove: bestMove };
              R.updateEvalUI(lastScore, lastScoreType, R.formatUciMove(bestMove));
            }
          );
        }
      } else if (R.startPositionEval) {
        R.updateEvalUI(R.startPositionEval.score, R.startPositionEval.scoreType, R.formatUciMove(R.startPositionEval.bestMove));
      } else {
        R.updateEvalUI(35, 'cp', '');
      }

      R.updateNavState();
      return;
    }

    const parsed = R.moveHistory[R.currentMoveIndex];

    R.board.position(parsed.fen);

    $('.move-white, .move-black').removeClass('active');
    $('.move-white[data-index="' + index + '"], .move-black[data-index="' + index + '"]').addClass('active');

    R.renderPieceBadge();
    R.renderBestMoveArrow();

    if (R.engineInitialized && !R.isAnalyzingGame) {
      const depth = parseInt($('#depthSelect').val()) || 15;

      if (parsed.eval !== undefined) {
        R.updateEvalUI(parsed.eval, parsed.evalType, R.formatUciMove(parsed.bestMove));
      } else {
        var lastScore = 0;
        var lastScoreType = 'cp';

        R.engine.analyzePosition(
          parsed.fen,
          depth,
          function (info) {
            if (info.scoreType) {
              lastScore = info.score;
              lastScoreType = info.scoreType;
              R.updateEvalUI(info.score, info.scoreType);
            }
          },
          function (bestMove) {
            parsed.eval = lastScore;
            parsed.evalType = lastScoreType;
            parsed.bestMove = bestMove;
            R.updateEvalUI(lastScore, lastScoreType, R.formatUciMove(bestMove));
          }
        );
      }
    } else if (parsed.eval !== undefined) {
      R.updateEvalUI(parsed.eval, parsed.evalType, R.formatUciMove(parsed.bestMove));
    }

    R.updateNavState();
    R.updateChartPosition();
    R.updateExplanationPanel();
  };

  /** Flip the board. */
  R.flipBoard = function () {
    if (R.board) R.board.flip();
  };
})();