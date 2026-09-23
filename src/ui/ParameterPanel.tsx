import type { GenerationParameters, QualityPreset } from "../core/types";

interface Props {
  readonly value: GenerationParameters;
  readonly disabled: boolean;
  readonly onChange: (patch: Partial<GenerationParameters>) => void;
}

function NumberField({ label, value, suffix, min, step = 1, disabled, onChange }: {
  label: string; value: number; suffix?: string; min?: number; step?: number; disabled: boolean; onChange: (value: number) => void;
}) {
  return <label className="field"><span>{label}</span><div className="input-shell"><input type="number" value={value} min={min} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <em>{suffix}</em>}</div></label>;
}

export function ParameterPanel({ value, disabled, onChange }: Props) {
  return (
    <section className="panel" aria-labelledby="parameter-title">
      <div className="panel-heading"><span className="step">02</span><div><h2 id="parameter-title">분할 조건</h2><p>바뀌지 않는 하드 제약</p></div></div>
      <div className="field-grid">
        <NumberField label="포켓 수" value={value.cellCount} min={1} disabled={disabled} onChange={(cellCount) => onChange({ cellCount })} />
        <NumberField label="최소 면적" value={value.minPocketAreaMm2} suffix="mm²" min={0.1} step={10} disabled={disabled} onChange={(minPocketAreaMm2) => onChange({ minPocketAreaMm2 })} />
        <NumberField label="최대 면적" value={value.maxPocketAreaMm2} suffix="mm²" min={0.1} step={10} disabled={disabled} onChange={(maxPocketAreaMm2) => onChange({ maxPocketAreaMm2 })} />
        <label className="field"><span>품질</span><select value={value.qualityPreset} disabled={disabled} onChange={(event) => onChange({ qualityPreset: event.target.value as QualityPreset })}><option value="draft">Draft</option><option value="standard">Standard</option><option value="extended">Extended</option></select></label>
      </div>
      <label className="field full"><span>재현 시드</span><input value={value.seed} disabled={disabled} onChange={(event) => onChange({ seed: event.target.value })} /></label>
    </section>
  );
}

export function AdvancedManufacturingPanel({ value, disabled, onChange }: Props) {
  return (
    <details className="panel advanced">
      <summary><span><span className="step">03</span><strong>제작 여유</strong></span><small>고급 설정</small></summary>
      <div className="field-grid advanced-grid">
        <NumberField label="포켓 사이 웹 폭" value={value.webWidthMm} suffix="mm" min={0.1} step={0.5} disabled={disabled} onChange={(webWidthMm) => onChange({ webWidthMm })} />
        <NumberField label="외곽 여백" value={value.outerMarginMm} suffix="mm" min={0} step={0.5} disabled={disabled} onChange={(outerMarginMm) => onChange({ outerMarginMm })} />
      </div>
      <p className="microcopy">외곽 여백은 웹 폭의 절반 이상이어야 합니다. 생성 중에는 이 값이 자동으로 바뀌지 않습니다.</p>
    </details>
  );
}
