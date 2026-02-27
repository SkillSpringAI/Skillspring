import { loadRegistries } from "../runtime/registries/registryIndex";

export async function run() {
  const { failure, invariants } = loadRegistries();
  if (!failure.codes?.length) throw new Error("Failure registry empty");
  if (!invariants.invariants?.length) throw new Error("Invariant registry empty");
  return { ok: true, failures: failure.codes.length, invariants: invariants.invariants.length };
}
