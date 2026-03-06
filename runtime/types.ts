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

export type EvidenceStatus = "PROVIDED" | "ASSUMED" | "UNKNOWN" | "ESTIMATE";

export type PolicyDecision = "ALLOW" | "REFUSE";

export type PolicyEvidenceStatus = "KNOWN" | "UNKNOWN";

export type TriggerHit = {
  dataset: string;
  id: string;
  match?: string;

  // provenance (optional until schema is updated)
  source?: "keyword" | "heuristic" | "rule";
  confidence?: number; // 0..1
};

export type PolicyBlock = {
  decision: PolicyDecision;
  decision_code: string;
  mode_reason: ModeReasonCode;
  dataset_versions: {
    dual_use: string;
    reconstruction: string;
    [k: string]: string;
  };
  trigger_hits: readonly TriggerHit[];
  evidence_status: PolicyEvidenceStatus;
};

export type PipelineInput = {
  user_input: string;
  meta?: {
    source?: string;
    timestamp_utc?: string;
    // diagnostics-only authority controls (must not be used in production callers)
    authority_test_overrides?: {
      tamper_dla_hash?: boolean;
      tamper_pt_scope_empty?: boolean;
      omit_dla?: boolean;
      omit_pt?: boolean;
    };
  };
};

export type ClassifiedContext = {
  mode: Mode;
  mode_reason: ModeReasonCode;
  domain_hints: string[];
  trigger_hits: readonly TriggerHit[];
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
      mode_reason: ModeReasonCode;
      trace_id: string;
      policy: PolicyBlock;
      evidence: Array<{ item: string; status: EvidenceStatus }>;
      response: {
        type: "SAFE_STUB";
        text: string;
      };
    }
  | {
      ok: false;
      mode: Mode;
      mode_reason: ModeReasonCode;
      trace_id: string;
      policy: PolicyBlock;
      refusal: {
        code: string;
        message: string;
        invariant_id?: string;
        failure_code?: string;
        owner?: string;
        retry_scope?: "none" | "scoped_retry" | "artifact_rebuild";
      };
    };
