import { GOVERNANCE_MANIFEST } from "./governance/generated.js";

export const governanceManifest = GOVERNANCE_MANIFEST;

export function datasetVersions(): { dual_use: string; reconstruction: string } {
  return {
    dual_use: governanceManifest.datasets.dual_use.version,
    reconstruction: governanceManifest.datasets.reconstruction.version
  };
}

export function datasetVersionNote(): string {
  const versions = datasetVersions();
  return `datasets: dual-use=${versions.dual_use}; reconstruction=${versions.reconstruction}`;
}
