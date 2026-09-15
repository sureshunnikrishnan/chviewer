import { spawn } from "node:child_process"
import { platform } from "node:os"
import type { CliRenderer } from "@opentui/core"

/** Copy text to the system clipboard (host + OSC 52 when available). */
export async function copyTextToClipboard(
  text: string,
  renderer?: CliRenderer,
): Promise<void> {
  renderer?.copyToClipboardOSC52(text)

  const os = platform()
  if (os === "darwin") {
    await pipeToCommand("pbcopy", [], text)
    return
  }

  if (os === "win32") {
    await pipeToCommand("clip", [], text)
    return
  }

  try {
    await pipeToCommand("wl-copy", [], text)
  } catch {
    await pipeToCommand("xclip", ["-selection", "clipboard"], text)
  }
}

function pipeToCommand(command: string, args: string[], text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
    child.stdin.write(text)
    child.stdin.end()
  })
}
