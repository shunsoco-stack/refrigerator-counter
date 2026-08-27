import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const binary = process.env.GITLEAKS_BIN || "gitleaks";
const version = spawnSync(binary, ["version"], { encoding: "utf8", cwd: projectRoot });
if (version.error || version.status !== 0) {
  console.error("Gitleaks is required. Install Gitleaks 8.x, or set GITLEAKS_BIN to the executable path.");
  process.exit(1);
}
if (!existsSync(join(projectRoot, ".git"))) {
  console.error("Initialize this project's own Git repository first. Parent repositories are never scanned.");
  process.exit(1);
}
console.log(`Secret Scan: Gitleaks ${version.stdout.trim()} | ${new Date().toISOString()}`);
mkdirSync(join(projectRoot, "tmp"), { recursive: true });
const common = ["--redact=100", "--no-banner", "--no-color", "--ignore-gitleaks-allow", "--timeout=120", "--report-format=json", "--config=.gitleaks.toml"];
const directory = spawnSync(binary, ["dir", ".", ...common, "--report-path=tmp/secret-scan-directory.json"], { cwd: projectRoot, stdio: "inherit" });
if (directory.error || directory.status !== 0) process.exit(directory.status || 1);

const hasCommits = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: projectRoot, stdio: "ignore" }).status === 0;
if (!hasCommits) {
  console.log("PASS: working directory. Git history is not yet available; rerun after the first commit before publishing.");
  process.exit(0);
}
const history = spawnSync(binary, ["git", ".", "--log-opts=--all", ...common, "--report-path=tmp/secret-scan-history.json"], { cwd: projectRoot, stdio: "inherit" });
if (history.error || history.status !== 0) process.exit(history.status || 1);
console.log("PASS: working directory and all Git history. No secrets found.");
