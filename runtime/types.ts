export type RiskReasonCode =
  | "RECONSTRUCTION_RISK"
  | "DUAL_USE"
  | "RIGHTS_IMPACT"
  | "NONE";

export type ModeReasonCode =
  | "ARCHITECT_KEYWORDS"
  | "RECONSTRUCTION_RISK"
  | "DUAL_USE"
  | "RIGHTS_IMPACT"
  | "DEFAULT_SAFE";

export type Mode = "DEFAULT" | "GOVERNANCE" | "ARCHITECT";

export type PipelineInput = {
  user_input: string;
  meta?: {
    source?: string;
    timestamp_utc?: string;
  };
};

export type ClassifiedContext = {
  mode: Mode;
  mode_reason: ModeReasonCode;
  domain_hints: string[];
  jurisdiction?: {
    guess?: string;
    confidence: number;
  };
  risk: {
    rights_impact: boolean;
    dual_use: boolean;
    reconstruction_risk: boolean;
    reason_code: RiskReasonCode;
    confidence: number;
  };
};

export type ExecutionArtifact = {
  kind: "STUB";
  note: string;
};

export type PipelineOutput =
  | {
      ok: true;
      mode: Mode;
      trace_id: string;
      evidence: Array<{ item: string; status: "PROVIDED" | "ASSUMED" | "UNKNOWN" | "ESTIMATE" }>;
      response: {
        type: "SAFE_STUB";
        text: string;
      };
    }
  | {
      ok: false;
      mode: Mode;
      trace_id: string;
      refusal: {
        code: string;
        message: string;
      };
    };
