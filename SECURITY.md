# Security Policy

## Scope

Security review covers the constitutional rules, authority artifacts,
registry and policy bindings, deterministic enforcement gates, evidence
handling, output admissibility, the local HTTP API, provider test clients, and
experimental signed-policy inputs.

The current repository intentionally does not provide autonomous tool
execution, remote execution, or production-grade process isolation. Do not
treat the current runtime as a complete security boundary for real-world
side effects.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to
contact.skillspringai@gmail.com. Include the affected commit or version, a
minimal reproduction, impact, and any suggested mitigation. Do not disclose
exploitable details publicly until a coordinated disclosure decision has been
made.

## Supported versions

Only the current `main` branch and the latest published milestone, when one
exists, are expected to receive security fixes.

## Security assumptions and limitations

The repository assumes trusted local process and filesystem boundaries. It
does not currently claim protection against a fully compromised host, runtime,
dependency, audit store, or update channel. Future execution and integration
work must add explicit threat modeling, provenance verification, scoped
authority, and execution-time revalidation.

Dependency changes should be reviewed for supply-chain risk and verified by
the repository preflight checks.

The HTTP endpoint binds to loopback and validates host/origin, request size,
and deadlines. It has no remote authentication and assumes trusted local
clients. Do not expose it publicly as an authenticated service.

Bedrock commands are opt-in tests using fixed prompts. Keep bearer tokens in
the local environment; never commit credentials or include them in reports.
Offline diagnostics use fake provider responses and ephemeral signing keys.

Signed-policy verification remains a simulation. Pinned test trust, revocation,
and revision observations are process-local; restart loses history. Signatures
do not establish evidence truth, complete review history, or resource access.
Actual access and answer-release flags remain false.
