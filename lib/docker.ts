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

// `timeout` only kills its own process group, so anything a command detached (`cmd &`, nohup, setsid)
// is reparented to the container's init and keeps running. Exec'd commands show up with PPID 0 and the
// container's keep-alive loop is init's oldest child; every other process under init is a stray.
// Several passes catch strays that forked while the previous pass was running.
const KILL_STRAYS_SCRIPT = `
self=$$
pass=0
while [ $pass -lt 10 ]; do
  pass=$((pass + 1))
  all=""
  keep=""
  keepStart=""
  for d in /proc/[0-9]*; do
    p=\${d#/proc/}
    { read -r s < "$d/stat"; } 2>/dev/null || continue
    set -- \${s##*) }
    [ "$1" = Z ] && continue
    eval "pp_$p=$2"
    all="$all $p"
    if [ "$2" = 1 ] && { [ -z "$keepStart" ] || [ "\${20}" -lt "$keepStart" ]; }; then keep=$p; keepStart=\${20}; fi
  done
  targets=""
  for p in $all; do
    [ "$p" = 1 ] || [ "$p" = "$self" ] && continue
    q=$p
    while :; do
      eval "par=\\$pp_$q"
      if [ -z "$par" ] || [ "$par" = 0 ]; then break; fi
      if [ "$par" = 1 ]; then [ "$q" != "$keep" ] && targets="$targets $p"; break; fi
      q=$par
    done
  done
  [ -z "$targets" ] && exit 0
  kill -KILL $targets 2>/dev/null
done
exit 1
`;

export async function killStrayProcesses(container: Docker.Container) {
  const exec = await container.exec({
    Cmd: ["/bin/sh", "-c", KILL_STRAYS_SCRIPT],
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
    User: "10001:10001",
  });
  await exec.start({ Detach: true });
  for (let i = 0; i < 20; i += 1) {
    const { Running } = await exec.inspect();
    if (!Running) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
