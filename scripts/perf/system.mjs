import { execFileSync } from "node:child_process";
import os from "node:os";

function powershell(script) {
  return execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function machine() {
  const cpus = os.cpus();
  return {
    os: `${os.type()} ${os.release()}`,
    cpu: cpus[0]?.model?.trim(),
    logicalCores: cpus.length,
    ramGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    node: process.version,
  };
}

export function gitCommit(cwd) {
  const run = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  return { commit: run(["rev-parse", "--short", "HEAD"]), dirty: run(["status", "--porcelain"]).length > 0 };
}

/** Memory of a process and all its descendants (the app plus its msedgewebview2 children), in MB. */
export function processTreeMemory(rootPid) {
  const script = `
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
$ids = New-Object System.Collections.Generic.HashSet[int]
[void]$ids.Add(${Number(rootPid)})
$added = $true
while ($added) {
  $added = $false
  foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added = $true } }
}
$procs = Get-Process -Id ([int[]]$ids) -ErrorAction SilentlyContinue
[pscustomobject]@{
  processes = @($procs).Count
  workingSetMb = [math]::Round((($procs | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 1)
  privateMb = [math]::Round((($procs | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB, 1)
} | ConvertTo-Json -Compress`;
  return JSON.parse(powershell(script));
}
