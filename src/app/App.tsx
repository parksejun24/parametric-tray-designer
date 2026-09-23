import { useMemo, useReducer, useRef } from "react";
import { confirmScale, exportDxf, exportSvg, importOutline, ImportError } from "../io";
import { AdvancedManufacturingPanel, ParameterPanel } from "../ui/ParameterPanel";
import { DiagnosticsPanel, ProgressPanel, ScorePanel } from "../ui/DiagnosticsPanel";
import { ExportPanel } from "../ui/ExportPanel";
import { ImportPanel } from "../ui/ImportPanel";
import { Preview } from "../ui/Preview";
import { verifyExportedDxf } from "../verification/dxf/verifyExportedDxf";
import { startGeneration, type GenerationJob } from "./engineAdapter";
import { initialState, reducer } from "./reducer";

function download(contents: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const currentJob = useRef<GenerationJob | null>(null);
  const success = state.outcome?.status === "success" ? state.outcome : null;
  const failure = state.outcome?.status === "failure" ? state.outcome : null;
  const canGenerate = Boolean(state.outline?.sourceToMm) && state.status !== "running";
  const exportData = useMemo(() => success ? {
    outline: success.outline.outer,
    pockets: success.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer })),
  } : null, [success]);
  const exportBundle = useMemo(() => {
    if (!exportData || !success) return null;
    const dxf = exportDxf(exportData);
    return { dxf, svg: exportSvg(exportData), verification: verifyExportedDxf(dxf, success) };
  }, [exportData, success]);

  async function load(file: File): Promise<void> {
    try {
      dispatch({ type: "outline/imported", outline: await importOutline(file) });
    } catch (error) {
      const message = error instanceof ImportError ? `${error.message} (${error.code})` : error instanceof Error ? error.message : "파일을 불러오지 못했습니다.";
      dispatch({ type: "outline/error", message });
    }
  }

  function generate(): void {
    if (!state.outline) return;
    const job = startGeneration(state.outline, state.parameters, (progress) => dispatch({ type: "generation/progress", jobId: job.id, progress }));
    currentJob.current = job;
    dispatch({ type: "generation/started", jobId: job.id });
    void job.result
      .then((outcome) => dispatch({ type: "generation/completed", jobId: job.id, outcome }))
      .catch((error: unknown) => dispatch({ type: "generation/error", jobId: job.id, message: error instanceof Error ? error.message : "생성 엔진 오류가 발생했습니다." }))
      .finally(() => { if (currentJob.current?.id === job.id) currentJob.current = null; });
  }

  function cancel(): void {
    const job = currentJob.current;
    if (!job) return;
    job.cancel();
    dispatch({ type: "generation/cancelled", jobId: job.id });
  }

  function save(kind: "dxf" | "svg"): void {
    if (!exportBundle || !success || !exportBundle.verification.ok) return;
    const filename = `tray-${success.metadata.resultHash.slice(0, 10)}.${kind}`;
    if (kind === "dxf") download(exportBundle.dxf, filename, "application/dxf");
    else download(exportBundle.svg, filename, "image/svg+xml");
  }

  return (
    <div className="app-shell">
      <header className="topbar"><a className="brand" href="#top" aria-label="Formfield 홈"><span>F</span><strong>FORMFIELD</strong></a><div className="product-label">PARAMETRIC TRAY DESIGNER <i>LOCAL</i></div><a className="about" href="#about">도구 안내</a></header>
      <main id="top">
        <aside className="control-column">
          <div className="intro"><p>GENERATIVE WORKBENCH / 01</p><h1>Outline in.<br /><em>Order emerges.</em></h1><span>외곽선의 흐름을 읽어, 실용적인 유기형 포켓을 설계합니다.</span></div>
          <ImportPanel outline={state.outline} disabled={state.status === "running"} onFile={(file) => void load(file)} onScale={(scale) => { if (state.outline) dispatch({ type: "outline/imported", outline: confirmScale(state.outline, scale) }); }} />
          <ParameterPanel value={state.parameters} disabled={state.status === "running"} onChange={(patch) => dispatch({ type: "parameters/changed", patch })} />
          <AdvancedManufacturingPanel value={state.parameters} disabled={state.status === "running"} onChange={(patch) => dispatch({ type: "parameters/changed", patch })} />
          {state.message && !failure && <div className="inline-message">{state.message}</div>}
          <div className="generate-actions">{state.status === "running" ? <button className="cancel" type="button" onClick={cancel}>생성 취소</button> : <button className="generate" type="button" disabled={!canGenerate} onClick={generate}>포켓 생성 <span>→</span></button>}<small>파라미터는 자동 완화되지 않습니다.</small></div>
        </aside>
        <section className="workspace" aria-label="설계 결과">
          <div className="workspace-head"><div><span>LIVE GEOMETRY</span><h2>{state.outline ? "포켓 작업 영역" : "새 작업"}</h2></div><span className={`run-state ${state.status}`}>{state.status === "running" ? "OPTIMIZING" : state.status === "success" ? "VALIDATED" : state.outline ? "READY" : "WAITING"}</span></div>
          <div className="canvas"><div className="ruler horizontal" /><div className="ruler vertical" /><Preview outline={state.outline} result={success} /><span className="axis axis-x">X</span><span className="axis axis-y">Y</span></div>
          <div className="result-dock">
            {state.status === "running" && <ProgressPanel progress={state.progress} />}
            {failure && <DiagnosticsPanel failure={failure} />}
            {success && <ScorePanel result={success} />}
            {success && exportBundle && !exportBundle.verification.ok && <div className="diagnostic error"><strong>내보내기 검증 실패</strong><p>{exportBundle.verification.message}</p><code>{exportBundle.verification.reason}</code></div>}
            {!success && !failure && state.status !== "running" && <div className="result-placeholder"><strong>결과 진단</strong><span>생성 후 활용률, 면적 분포와 흐름 점수가 표시됩니다.</span></div>}
            <ExportPanel enabled={Boolean(success && exportBundle?.verification.ok)} onDxf={() => save("dxf")} onSvg={() => save("svg")} />
          </div>
        </section>
      </main>
      <footer id="about"><span>모든 계산은 이 브라우저 안에서 처리됩니다.</span><span>NO CLOUD · NO ACCOUNT · 2D ONLY</span></footer>
    </div>
  );
}
