import type { GenerationFailure, GenerationProgress, GenerationSuccess } from "../core/types";

const PHASE: Record<GenerationProgress["phase"], string> = {
  validating: "형상 검증",
  initializing: "초기 셀 배치",
  balancing: "면적 균형",
  searching: "유기적 흐름 탐색",
  finalizing: "최종 형상 검증",
};

export function ProgressPanel({ progress }: { progress: GenerationProgress | null }) {
  const ratio = progress ? Math.min(1, progress.evaluations / Math.max(1, progress.evaluationBudget)) : 0;
  return <div className="progress-card"><div><strong>{progress ? PHASE[progress.phase] : "준비 중"}</strong><span>{progress?.evaluations ?? 0} / {progress?.evaluationBudget ?? "—"}</span></div><div className="progress-track"><i style={{ width: `${ratio * 100}%` }} /></div></div>;
}

export function DiagnosticsPanel({ failure }: { failure: GenerationFailure }) {
  return <div className="diagnostic error"><span>생성할 수 없음</span><strong>{failure.category.replaceAll("_", " ")}</strong><p>{failure.message}</p><code>{failure.reason}</code></div>;
}

export function ScorePanel({ result }: { result: GenerationSuccess }) {
  const score = Math.max(0, Math.round((1 - result.score.totalCost) * 100));
  return (
    <div className="score-grid">
      <div className="score-hero"><small>DESIGN SCORE</small><strong>{score}</strong><span>/ 100</span></div>
      <dl><div><dt>공간 활용률</dt><dd>{(result.utilization * 100).toFixed(1)}%</dd></div><div><dt>유기적 편차</dt><dd>{(result.score.organicAreaCv * 100).toFixed(1)}%</dd></div><div><dt>방향성</dt><dd>{result.score.flowAvailable ? `${Math.max(0, (1 - result.score.flowCost) * 100).toFixed(0)}%` : "중립"}</dd></div><div><dt>평가 횟수</dt><dd>{result.evaluations.toLocaleString()}</dd></div></dl>
    </div>
  );
}
