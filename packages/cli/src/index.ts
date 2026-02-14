#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

type Managed = {
  name: string;
  proc: ReturnType<typeof spawn>;
};

function spawnManaged(
  name: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Managed {
  const proc = spawn(command, args, {
    stdio: "inherit",
    env,
    cwd,
    shell: process.platform === "win32",
  });

  return { name, proc };
}

const [command, ...args] = process.argv.slice(2);
const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(currentDir, "../../..");

if (!command || command === "help" || command === "--help") {
  console.log("server-devtools dev [-- <your-dev-command>]");
  process.exit(0);
}

if (command !== "dev") {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

const separatorIndex = args.indexOf("--");
const forwarded = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

const managed: Managed[] = [];
let shuttingDown = false;

const shutdown = (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of managed) {
    if (!child.proc.killed) {
      child.proc.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of managed) {
      if (!child.proc.killed) {
        child.proc.kill("SIGKILL");
      }
    }
    process.exit(exitCode);
  }, 1500).unref();
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const ui = spawnManaged("ui", "pnpm", ["dev:ui"], process.env, projectRoot);
managed.push(ui);

ui.proc.on("exit", (code: number | null) => {
  if (shuttingDown) {
    return;
  }

  const exitCode = code ?? 0;
  if (exitCode !== 0) {
    console.error(`[server-devtools] UI exited with code ${exitCode}`);
  }
  shutdown(exitCode);
});

if (forwarded.length > 0) {
  const [target, ...targetArgs] = forwarded;
  if (!target) {
    console.error("Missing target command after --");
    process.exit(1);
  }

  const registerPath = path.resolve(projectRoot, "packages/instrumentation/dist/register.cjs");
  const nodeOptions = `${process.env.NODE_OPTIONS ?? ""} --require ${registerPath}`.trim();

  const instrumentedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  };

  const targetProcess = spawnManaged("app", target, targetArgs, instrumentedEnv);
  managed.push(targetProcess);

  targetProcess.proc.on("exit", (code: number | null) => {
    if (shuttingDown) {
      return;
    }

    const exitCode = code ?? 0;
    if (exitCode !== 0) {
      console.error(`[server-devtools] App command exited with code ${exitCode}`);
    }
    shutdown(exitCode);
  });
} else {
  console.log("[server-devtools] UI running. Pass your app command using: server-devtools dev -- next dev");
}
