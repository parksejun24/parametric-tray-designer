export function ExportPanel({ enabled, onDxf, onSvg }: { enabled: boolean; onDxf: () => void; onSvg: () => void }) {
  return <div className="export-actions"><button className="primary" type="button" disabled={!enabled} onClick={onDxf}>DXF 내려받기 <span>↘</span></button><button type="button" disabled={!enabled} onClick={onSvg}>SVG 내려받기</button>{!enabled && <small>검증된 결과가 있을 때만 내보낼 수 있습니다.</small>}</div>;
}
