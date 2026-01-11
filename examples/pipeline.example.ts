import { runPipeline } from "../runtime/pipeline";

const noContext = runPipeline({});
console.log("noContext:", noContext);

const authorityEscalation = runPipeline({
  domain: "general",
  jurisdiction: "NZ",
  authorityRequested: true
});
console.log("authorityEscalation:", authorityEscalation);

const minimalValid = runPipeline({
  domain: "general",
  jurisdiction: "NZ"
});
console.log("minimalValid:", minimalValid);
