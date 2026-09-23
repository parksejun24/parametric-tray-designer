import type { GenerationSuccess } from "../core/types";
import type { ImportedOutline, Point2 } from "../io";

function path(points: readonly Point2[]): string {
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ")} Z`;
}

export function Preview({ outline, result }: { outline: ImportedOutline | null; result: GenerationSuccess | null }) {
  if (!outline) return <div className="preview-empty"><span>+</span><p>외곽선을 불러오면<br />작업 영역이 열립니다.</p></div>;
  const bounds = outline.bounds;
  const padding = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.08;
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.maxX - bounds.minX + padding * 2} ${bounds.maxY - bounds.minY + padding * 2}`;
  return (
    <svg className="drawing" role="img" aria-label="트레이 포켓 미리보기" viewBox={viewBox}>
      <path className="outline-shape" d={path(outline.points)} />
      {result?.pockets.map((pocket, index) => <path className={`pocket pocket-${index % 5}`} key={pocket.id} d={path(pocket.polygon.outer)} />)}
    </svg>
  );
}
