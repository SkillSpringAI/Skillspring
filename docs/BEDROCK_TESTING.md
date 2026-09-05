# Bedrock integration smoke test

User-selected source Region: `ap-southeast-2` (Sydney).
User-selected inference profile:
`au.anthropic.claude-opus-4-6-v1` (replaces the previous APAC Sonnet profile).

This is a test-only Converse client under `scripts/bedrock/`. The local HTTP
endpoint and governance runtime still use the safe stub. No provider code is
imported into those entry points. Check the selected profile's destination
Regions in AWS before relying on a data-residency guarantee. Availability and
account permissions were demonstrated by the user-run smoke test below.

## Recorded live evidence

The user supplied this smoke-test result in the project conversation:

- Region: `ap-southeast-2`.
- Profile: `au.anthropic.claude-opus-4-6-v1`.
- Connected: `true`; generated characters: `254`; stop reason: `end_turn`.
- Evaluation of generated text as input: `ALLOW`.
- Manifest: `sha256:db898761933265c709f09ae3745d54e9309a70a4e57158f09c7ee7274b9fc8bb`.

This records user-reported evidence; the assistant did not independently rerun
the live request. No credential or raw model text is included. One successful
call establishes connectivity at that time, not continuing credential validity,
answer quality, output admissibility, or authority to perform external actions.

## Configure and run

For the subsequent controlled suite (input prechecks and diagnostic output
checks), see `docs/MODEL_INTEGRATION_TESTS.md`. Its opt-in command is
`npm run bedrock:evaluate -- --live`; the smoke command below remains a
single-request connectivity check.

For provenance-bound candidates using real transport request IDs, run
`npm run bedrock:candidates -- --live`. See `docs/GENERATED_ANSWER_CONTRACT_V1.md`.
Successful client calls now require a valid AWS request-ID response header;
`BEDROCK_MISSING_REQUEST_ID` means it was missing or malformed. No request ID
is invented or extracted from model text.

In the AWS Bedrock console with Sydney selected, open API keys, then generate
a short-term API key using an IAM identity allowed to invoke the selected
profile and its destination models. Complete Anthropic's first-use form if AWS
requests it. Do not paste the key into chat, source files, or command literals.

In PowerShell at the repository root, enter the key at a hidden prompt:

```powershell
$bedrockKey = Read-Host 'Bedrock short-term API key' -AsSecureString
$env:AWS_BEARER_TOKEN_BEDROCK = [System.Net.NetworkCredential]::new('', $bedrockKey).Password
npm run bedrock:smoke -- --live
```

The environment variable is available only in this shell and child processes.
No `.env` file is loaded. The key expires with the AWS console session, up to
12 hours. Remove it when finished:

```powershell
Remove-Item Env:AWS_BEARER_TOKEN_BEDROCK
Remove-Variable bedrockKey
```

`npm run bedrock:smoke` without `--live` makes no AWS request. With `--live`,
the harness makes one billable request containing only a fixed, synthetic
software-governance prompt. It limits output to 64 tokens, response bytes to
64 KiB, and the network request to 15 seconds. It neither retries nor follows
redirects. No repository contents or user prompts are sent.

The generated text is fed into `evaluateV1` as untrusted input. The report
contains connection status, character count, stop reason, governance decision,
and manifest ID. Generated text and credentials are not printed. On HTTP
failure, only the JSON message field is shown after redacting the supplied
token, AWS resource ARNs, account IDs, and recognizable AWS key strings.
The message is bounded and labelled as an AWS diagnostic; other error-body
fields are omitted. This tests connectivity and input evaluation, not admissibility of
model-generated answers or permission to execute anything.

`npm run preflight` uses fake transports and never invokes AWS. It tests
credential absence, request limits, no retries, error redaction, malformed and
oversized responses, and rejection of tool-use output.

## Troubleshooting

- `BEDROCK_CREDENTIAL_REQUIRED`: set the environment variable in this shell.
- `BEDROCK_HTTP_403`: check key expiration, IAM/profile permissions, and model access.
  Read the accompanying redacted AWS diagnostic before changing permissions
  or generating more keys. A new PowerShell window does not inherit a key set
  in another shell; re-entering it is required if switching windows.
- Known AWS error types may add a suffix such as `_EXPIRED_TOKEN` or
  `_ACCESS_DENIED`. No separate login is needed for bearer-key authentication.
  Short-term keys inherit the generating identity's permissions. Cross-Region
  inference requires invocation access to the profile and destination models;
  an explicit denial of `bedrock:CallWithBearerToken` also blocks API-key use.
  Generate keys in Sydney, and set them in the same shell that runs the test.
- `BEDROCK_HTTP_400`: check profile availability and request support in the source Region.
- `BEDROCK_HTTP_429`: check account quota or wait before explicitly retrying.
- `BEDROCK_NETWORK_OR_TIMEOUT`: the request failed or exceeded the deadline;
  a timed-out request may still have been processed and billed.

References: [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html),
[API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html),
[cross-Region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html).
