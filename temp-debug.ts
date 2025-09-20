import { createErrorRecoverySystem } from "./client/src/services/voice/error-recovery";

async function main() {
  const system = await createErrorRecoverySystem({ mode: "balanced" });
  const error: any = new Error("Integration test error");
  error.code = "VOICE_LOW_CONFIDENCE";

  const result = await system.handleError(error, { sessionId: "test_session" }, {
    autoRecover: true,
    showUI: false
  });

  console.log({
    code: (system as any).classificationEngine ? (system as any).classificationEngine.classifyError ? "" : "" : "",
    result
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
