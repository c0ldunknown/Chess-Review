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

  // Example game for quick testing
  examplePgn: '[Event "Live Chess"]\n[Site "Chess.com"]\n[Date "2026.07.10"]\n[Round "?"]\n[White "vishal6877"]\n[Black "jkz1234"]\n[Result "0-1"]\n[TimeControl "600"]\n[WhiteElo "504"]\n[BlackElo "498"]\n[Termination "jkz1234 won by checkmate"]\n[ECO "C50"]\n[EndTime "10:28:36 GMT+0000"]\n[Link "https://www.chess.com/game/live/171373296294?move=0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Bc4 Bc5 5. d3 d6 6. O-O O-O 7. Ng5 h6 8. Nf3\nBg4 9. Nb5 Qd7 10. h3 Bh5 11. g4 Bg6 12. Nh4 Ne7 13. a4 a6 14. Nc3 Rfe8 15. g5\nBh5 16. Qd2 Qxh3 17. Ng2 Bf3 18. Rd1 Qxg2# 0-1',
};
