import type { GenerationOutcome, GenerationParameters, GenerationProgress } from "../core/types";
import type { ImportedOutline } from "../io";

export type WorkflowStatus = "empty" | "ready" | "running" | "success" | "failure" | "cancelled";

export interface AppState {
  readonly outline: ImportedOutline | null;
  readonly parameters: GenerationParameters;
  readonly status: WorkflowStatus;
  readonly progress: GenerationProgress | null;
  readonly outcome: GenerationOutcome | null;
  readonly message: string | null;
  readonly activeJobId: string | null;
}

export const initialState: AppState = {
  outline: null,
  parameters: {
    cellCount: 6,
    minPocketAreaMm2: 900,
    maxPocketAreaMm2: 2600,
    seed: "formfield-01",
    webWidthMm: 4,
    outerMarginMm: 6,
    qualityPreset: "standard",
  },
  status: "empty",
  progress: null,
  outcome: null,
  message: null,
  activeJobId: null,
};

export type AppAction =
  | { type: "outline/imported"; outline: ImportedOutline }
  | { type: "outline/error"; message: string }
  | { type: "parameters/changed"; patch: Partial<GenerationParameters> }
  | { type: "generation/started"; jobId: string }
  | { type: "generation/progress"; jobId: string; progress: GenerationProgress }
  | { type: "generation/completed"; jobId: string; outcome: GenerationOutcome }
  | { type: "generation/error"; jobId: string; message: string }
  | { type: "generation/cancelled"; jobId: string };

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "outline/imported":
      return { ...state, outline: action.outline, status: "ready", progress: null, outcome: null, message: null };
    case "outline/error":
      return { ...state, outline: null, status: "empty", progress: null, outcome: null, message: action.message };
    case "parameters/changed":
      return { ...state, parameters: { ...state.parameters, ...action.patch }, status: state.outline ? "ready" : "empty", outcome: null, message: null };
    case "generation/started":
      return { ...state, status: "running", activeJobId: action.jobId, progress: null, outcome: null, message: null };
    case "generation/progress":
      return action.jobId === state.activeJobId ? { ...state, progress: action.progress } : state;
    case "generation/completed":
      if (action.jobId !== state.activeJobId) return state;
      return {
        ...state,
        status: action.outcome.status === "success" ? "success" : action.outcome.status === "failure" ? "failure" : "cancelled",
        outcome: action.outcome,
        activeJobId: null,
        message: action.outcome.status === "failure" ? action.outcome.message : null,
      };
    case "generation/error":
      return action.jobId === state.activeJobId ? { ...state, status: "failure", activeJobId: null, message: action.message } : state;
    case "generation/cancelled":
      return action.jobId === state.activeJobId ? { ...state, status: "cancelled", activeJobId: null, message: "생성을 취소했습니다." } : state;
  }
}
