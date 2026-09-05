/** GENERATED. Source: schemas/registries/decision-codes.v1.json. */
export const DECISION_CODES_V1 = {
  "schema_version": "1.0.0",
  "status": "canonical",
  "change_control": "amendment-only (via constitutional protocol)",
  "codes": [
    {
      "code": "ALLOW_DEFAULT_SAFE",
      "class": "allow"
    },
    {
      "code": "ALLOW_GOVERNED_SAFE",
      "class": "allow"
    },
    {
      "code": "ALLOW_ARCHITECT_SAFE",
      "class": "allow"
    },
    {
      "code": "REFUSE_RECONSTRUCTION_RISK",
      "class": "refuse_risk"
    },
    {
      "code": "REFUSE_DUAL_USE",
      "class": "refuse_risk"
    },
    {
      "code": "REFUSE_POLICY_UNSPECIFIED",
      "class": "refuse_policy"
    },
    {
      "code": "REFUSE_INVALID_INPUT",
      "class": "refuse_input"
    },
    {
      "code": "REFUSE_MISSING_DLA",
      "class": "refuse_authority"
    },
    {
      "code": "REFUSE_INVALID_DLA",
      "class": "refuse_authority"
    },
    {
      "code": "REFUSE_MISSING_PT",
      "class": "refuse_authority"
    },
    {
      "code": "REFUSE_INVALID_PT",
      "class": "refuse_authority"
    },
    {
      "code": "REFUSE_LUMENS_AUTHORITY",
      "class": "refuse_authority"
    },
    {
      "code": "REFUSE_CAPABILITY_LEAK",
      "class": "refuse_output"
    },
    {
      "code": "REFUSE_SCHEMA_INVALID",
      "class": "refuse_output"
    },
    {
      "code": "REFUSE_LG_FAILURE_CODE_UNREGISTERED",
      "class": "refuse_authority"
    },
    {
      "code": "REFUSE_LG_RETRY_SCOPE_MISMATCH",
      "class": "refuse_authority"
    },
    {
      "code": "REFUSE_UNSAFE_OR_UNKNOWN",
      "class": "refuse_unknown"
    }
  ],
  "refusal_codes": [
    "REFUSE-INVALID-INPUT",
    "REFUSE-DUALUSE-OR-RECONSTRUCTION",
    "REFUSE-MISSING-DLA",
    "REFUSE-INVALID-DLA",
    "REFUSE-MISSING-PT",
    "REFUSE-INVALID-PT",
    "REFUSE-LUMENS-DLA-INTEGRITY",
    "REFUSE-LUMENS-PT-BINDING",
    "REFUSE-LUMENS-PT-EXPIRED",
    "REFUSE-OUTPUT-NOT-ADMISSIBLE",
    "REFUSE-CAPABILITY-LEAK",
    "REFUSE-LG-FAILURE-CODE-UNREGISTERED",
    "REFUSE-LG-RETRY-SCOPE-MISMATCH"
  ]
} as const;
