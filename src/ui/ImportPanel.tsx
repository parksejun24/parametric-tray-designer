import { useRef, useState } from "react";
import type { ImportedOutline } from "../io";

interface Props {
  readonly outline: ImportedOutline | null;
  readonly disabled: boolean;
  readonly onFile: (file: File) => void;
  readonly onScale: (scale: number) => void;
}

export function ImportPanel({ outline, disabled, onFile, onScale }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState("1");
  return (
    <section className="panel import-panel" aria-labelledby="import-title">
      <div className="panel-heading">
        <span className="step">01</span>
        <div><h2 id="import-title">외곽선</h2><p>하나의 닫힌 SVG 또는 DXF</p></div>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept=".svg,.dxf,image/svg+xml,application/dxf"
        disabled={disabled}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); }}
      />
      <button className="drop-zone" type="button" disabled={disabled} onClick={() => input.current?.click()}>
        <span className="upload-mark">↗</span>
        <strong>{outline ? outline.sourceName : "외곽선 파일을 선택하세요"}</strong>
        <small>{outline ? `${outline.points.length.toLocaleString()} points · ${outline.sourceFormat.toUpperCase()}` : "SVG · DXF / 최대 10 MB"}</small>
      </button>
      {outline?.sourceToMm ? (
        <div className="file-meta">
          <span>{outline.physicalWidthMm?.toFixed(1)} × {outline.physicalHeightMm?.toFixed(1)} mm</span>
          <span className="status-chip ok">단위 확인됨</span>
        </div>
      ) : outline ? (
        <div className="unit-gate">
          <label htmlFor="unit-scale">1 도면 단위는 몇 mm인가요?</label>
          <div className="inline-control">
            <input id="unit-scale" inputMode="decimal" value={scale} onChange={(event) => setScale(event.target.value)} />
            <button type="button" onClick={() => onScale(Number(scale))}>배율 적용</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
