export type ExecutionStatus =
  | "NOT_ATTEMPTED"
  | "PROPOSED"
  | "ASSESSED"
  | "REFUSED"
  | "APPROVED"
  | "AUTHORIZED"
  | "EXECUTION_STARTED"
  | "COMPLETED"
  | "FAILED"
  | "UNCERTAIN";

const transitions: Record<ExecutionStatus, readonly ExecutionStatus[]> = {
  NOT_ATTEMPTED: ["PROPOSED", "REFUSED"],
  PROPOSED: ["ASSESSED", "REFUSED"],
  ASSESSED: ["APPROVED", "REFUSED"],
  REFUSED: [],
  APPROVED: ["AUTHORIZED", "REFUSED"],
  AUTHORIZED: ["EXECUTION_STARTED", "REFUSED"],
  EXECUTION_STARTED: ["COMPLETED", "FAILED", "UNCERTAIN"],
  COMPLETED: [],
  FAILED: [],
  UNCERTAIN: []
};

export function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canTransition(from, to)) throw new Error(`Invalid execution lifecycle transition: ${from} -> ${to}`);
}
