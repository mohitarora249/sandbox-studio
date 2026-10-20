import Docker from "dockerode";

// Only these images can be selected by the UI. Never accept an arbitrary image name from an API request.
export const RUNTIME_IMAGES = {
  NODE: "sandbox-studio/node-runtime:22",
  PYTHON: "sandbox-studio/python-runtime:3.12",
} as const;

const globalForDocker = globalThis as unknown as { sandboxDocker?: Docker };

export function getDocker() {
  if (!globalForDocker.sandboxDocker) {
    globalForDocker.sandboxDocker = new Docker({
      socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
    });
  }
  return globalForDocker.sandboxDocker;
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown Docker error";
}
