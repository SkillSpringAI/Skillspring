import { generateKeyPairSync, sign } from "node:crypto";
import { evaluateV1 } from "../../runtime/api/evaluate.js";
import { hashAnswerText, type GeneratedAnswerCandidateV1 } from "../../runtime/answers/candidate.js";
import { policyDigest, type PolicySnapshot, type ScopedSubject } from "./boundary.js";
import { draftPolicy } from "./policy.js";
import { hashPolicyJson, type AccessMode, type CandidateAssessment, type ReviewRecord, type Role } from "./simulate.js";
import { artifactSigningBytes, type SignedArtifact, type TrustedKey } from "./verifier.js";
import { prepareCandidateReview, type CandidateReviewContext, type CandidateReviewPackage, type EvidenceSource } from "./candidate-review.js";

/** Synthetic evidence and ephemeral signers only. Never represents a real human approval. */
export async function makeCandidateReviewFixture(mode: AccessMode = "DEFAULT", text = "Governance assigns responsibility.") {
  const now = Date.parse("2026-09-06T00:00:00Z");
  const prompt = "Explain governance.";
  const inputDecision = (await evaluateV1({ schema_version: "skillspring.evaluate.request.v1", user_input: prompt })).result!;
  const source: EvidenceSource = { source_id: "source-1", text, content_sha256: hashAnswerText(text),
    resource: "sources/guide", organization: "team-a", domain: "engineering", origin: "synthetic:governance-guide",
    captured_at: new Date(now - 2000).toISOString() };
  const { text: _sourceText, ...receipt } = source;
  const candidate: GeneratedAnswerCandidateV1 = {
    schema_version: "skillspring.generated-answer-candidate.v1", kind: "GENERATED_ANSWER_CANDIDATE",
    trace_id: inputDecision.trace_id, governance_manifest_id: inputDecision.policy.governance_manifest_id,
    provenance: { provider: "AWS_BEDROCK", source_region: "ap-southeast-2", inference_profile_id: "synthetic-model",
      request_id: "synthetic-request", completed_at: new Date(now - 1000).toISOString(), stop_reason: "end_turn",
      prompt_sha256: hashAnswerText(prompt), answer_sha256: hashAnswerText(text) },
    answer: { text, purpose: "INFORMATIONAL_DRAFT" }, evidence: { verification: "UNVERIFIED",
      source_refs: [{ source_id: source.source_id, content_sha256: source.content_sha256 }] },
    review: { authority_claims: "PENDING", output_admissibility: "PENDING" }, release_authorized: false
  };
  const context: CandidateReviewContext = { candidateContext: { inputDecision, invocation: structuredClone(candidate.provenance),
    sourceReceipts: structuredClone(candidate.evidence.source_refs) }, evidenceReceipts: [receipt] };
  const audienceRole: Role = mode === "DEFAULT" ? "user" : mode === "GOVERNANCE" ? "governance_officer" : "engineering_maintainer";
  const scope: Omit<ScopedSubject, "candidate"> = { accessMode: mode, domain: "engineering", resource: "answers/draft",
    audience: ["alice"], requester: "alice", producer: "model", policyVersion: draftPolicy.version,
    purpose: "education", environment: "development", organization: "team-a", policy_digest: policyDigest };
  const claims = [{ id: "claim-1", start: 0, end: Array.from(text).length,
    support: [{ source_id: source.source_id, start: 0, end: Array.from(source.text).length }] }];
  const prepared = prepareCandidateReview(candidate, context, scope, [source], claims, now);
  if (!prepared.ok) throw new Error(prepared.reason);
  const subject = prepared.subject;
  const roles: { id: string; role: Role }[] = [
    { id: "reviewer", role: "domain_reviewer" }, { id: "officer", role: "governance_officer" },
    { id: "maintainer", role: "engineering_maintainer" }, { id: "alice", role: audienceRole }
  ];
  const signing = new Map(["publisher", ...roles.map(item => item.id)].map(id => [id, generateKeyPairSync("ed25519")]));
  const keys: TrustedKey[] = [...signing].map(([id, key]) => ({ id, organization: "team-a", principal: id,
    publicKeyPem: key.publicKey.export({ type: "spki", format: "pem" }).toString(),
    purposes: id === "publisher" ? ["snapshot"] : ["review"], notBefore: now - 10000, expiresAt: now + 20000 }));
  const snapshot: PolicySnapshot = {
    schema_version: "skillspring.policy-snapshot.draft.v1", id: "snapshot-1", organization: "team-a", policy_digest: policyDigest,
    issued_at: now - 5000, expires_at: now + 10000,
    principals: [...roles.map(item => ({ id: item.id, roles: [item.role], domains: ["engineering"] })),
      { id: "admin", roles: ["access_administrator"], domains: ["engineering"] }],
    resources: ["answers/draft", "sources/guide"].map(id => ({ id, domain: "engineering", environment: "development",
      classification: mode === "GOVERNANCE" ? "domain_restricted" : mode === "ARCHITECT" ? "engineering_sandbox" : "public" })),
    issuerMandates: [{ issuer: "admin", domains: ["engineering"], roles: ["user", "domain_reviewer", "governance_officer", "engineering_maintainer"], modes: [mode] }],
    clearances: roles.flatMap(item => ["answers/draft", "sources/guide"].map((resource, index) => ({
      id: `${item.id}-${index}`, subject: item.id, role: item.role, issuer: "admin", domain: "engineering", modes: [mode],
      resources: [resource], operations: ["read", "review_release"], issuedAt: now - 5000, expiresAt: now + 10000,
      revoked: false, purposes: ["education"], environments: ["development"]
    }))), denials: []
  };
  const seal = (unsigned: Omit<SignedArtifact, "signature">): SignedArtifact => ({ ...unsigned,
    signature: sign(null, artifactSigningBytes(unsigned), signing.get(unsigned.key_id)!.privateKey).toString("base64") });
  const signedSnapshot = (payload = snapshot, revision = 1) => seal({
    schema_version: "skillspring.signed-policy-artifact.draft.v1", algorithm: "Ed25519", kind: "snapshot", key_id: "publisher",
    organization: "team-a", artifact_id: payload.id, revision, issued_at: payload.issued_at, expires_at: payload.expires_at, payload
  });
  const assessment = (forSubject = subject): CandidateAssessment => {
    const pkg = forSubject.candidate as CandidateReviewPackage;
    return { schema_version: "skillspring.candidate-assessment.draft.v1", package_sha256: hashPolicyJson(pkg),
      answer_sha256: pkg.candidate.provenance.answer_sha256, coverage: "COMPLETE",
      claim_checks: pkg.claims.map(claim => ({ claim_id: claim.id, finding: "SUPPORTED" })),
      authority_claims: "CLEARED", output_admissibility: "PASS" };
  };
  const signedReview = (who = "reviewer", overrides: Partial<ReviewRecord> = {}, revision = 1, forSubject = subject) => {
    const record: ReviewRecord = { id: `${who}-record`, reviewer: who, role: roles.find(item => item.id === who)!.role,
      subjectHash: hashPolicyJson(forSubject), decision: "APPROVE", evidence: "VERIFIED", authorityClaims: "CLEARED",
      outputChecks: "PASS", reviewedAt: now, expiresAt: now + 5000, revoked: false,
      candidateAssessment: assessment(forSubject), ...overrides };
    if (record.candidateAssessment === undefined) delete record.candidateAssessment;
    return seal({ schema_version: "skillspring.signed-policy-artifact.draft.v1", algorithm: "Ed25519", kind: "review", key_id: who,
      organization: "team-a", artifact_id: record.id, revision, issued_at: record.reviewedAt, expires_at: record.expiresAt, payload: record });
  };
  const requiredReviewers = mode === "DEFAULT" ? ["reviewer"] : mode === "GOVERNANCE" ? ["reviewer", "officer"] : ["maintainer", "officer"];
  return { now, candidate, context, source, scope, claims, subject, snapshot, keys, seal, signedSnapshot, signedReview, assessment, requiredReviewers };
}
