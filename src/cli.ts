import { runGovernedPipeline } from "../runtime/pipeline.ts";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();

  if (!input) {
    console.error('No input provided. Example: npm run dev -- "hello"');
    process.exit(2);
  }

  const result = await runGovernedPipeline({
    user_input: input,
    meta: {
      source: "cli",
      timestamp_utc: new Date().toISOString()
    }
  });

  process.stdout.write(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  process.stdout.write(
    JSON.stringify(
      {
        ok: false,
        failure: {
          code: "FATAL-PIPELINE",
          message: err?.message ?? "Unknown error"
        }
      },
      null,
      2
    )
  );
  process.exit(1);
});
