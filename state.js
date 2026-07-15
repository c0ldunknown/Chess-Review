// Chess Review — Shared State
window.ChessReview = {
  board: null,
  currentMoveIndex: -1,
  moveHistory: [],
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  engine: null,
  engineInitialized: false,
  isAnalyzingGame: false,
  analysisQueue: [],
  analysisIndex: 0,
  startPositionEval: null,
  evalChartInstance: null,
  currentChartIndex: 0,
  explanationCache: {},
  explainMistakes: true,
  errorFilter: 'both', // 'both' | 'w' | 'b'
};