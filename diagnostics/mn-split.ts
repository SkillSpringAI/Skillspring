import { classifyJurisdiction } from "../runtime/metaNomos/jurisdictionClassifier.js";
import { scanThreats } from "../runtime/metaNomos/threatScanner.js";
import { classify } from "../runtime/controlPlane.js";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function run() {
  const text = "I need legal advice in New Zealand about a visa appeal and system governance.";

  const jurisdiction = classifyJurisdiction(text);
  const threat = scanThreats(text);
  const composed = classify({ user_input: text });

  // Jurisdiction module must stay jurisdiction-only
  must(!("dual_use" in (jurisdiction as any)), "mn-split: jurisdictionClassifier leaked threat fields");
  must(!("reconstruction_risk" in (jurisdiction as any)), "mn-split: jurisdictionClassifier leaked threat fields");
  must(!("trigger_hits" in (jurisdiction as any)), "mn-split: jurisdictionClassifier leaked trigger fields");

  // Threat module must stay threat-only
  must(!("guess" in (threat as any)), "mn-split: threatScanner leaked jurisdiction fields");
  must(!("jurisdiction" in (threat as any)), "mn-split: threatScanner leaked jurisdiction container");

  // Composed output must still be coherent
  must((composed.jurisdiction?.confidence ?? -1) >= 0, "mn-split: composed jurisdiction missing");
  must(Array.isArray(composed.trigger_hits), "mn-split: composed trigger_hits missing");
  must(typeof composed.risk.dual_use === "boolean", "mn-split: composed risk shape invalid");
  must(typeof composed.mode === "string", "mn-split: composed mode missing");

  return {
    ok: true,
    jurisdiction_guess: composed.jurisdiction?.guess ?? null,
    mode: composed.mode,
    trigger_hits: composed.trigger_hits.length
  };
}
