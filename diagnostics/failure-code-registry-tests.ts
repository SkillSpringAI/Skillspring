import { loadFailureCodeRegistry } from "../runtime/registries/failureCodes";

export async function run() {
  const reg = loadFailureCodeRegistry();
  if (!reg.codes?.length) throw new Error("Failure registry empty");
  return { ok: true, count: reg.codes.length };
}
