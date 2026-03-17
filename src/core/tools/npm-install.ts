import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult } from "./types.js";

const execAsync = promisify(exec);

/** Packages matching this prefix install without user confirmation. */
const TRUSTED_PREFIX = "betsy-";

export const npmInstallTool: Tool = {
  name: "npm_install",
  description:
    "Install an npm package. Packages prefixed with 'betsy-' install " +
    "without confirmation; all others require explicit approval.",
  parameters: [
    {
      name: "package_name",
      type: "string",
      description: "The npm package name to install (e.g. 'lodash' or 'betsy-utils')",
      required: true,
    },
  ],
  // Default to requiring confirmation; overridden at runtime for trusted packages.
  requiresConfirmation: true,

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const packageName = params.package_name;
    if (typeof packageName !== "string" || !packageName.trim()) {
      return {
        success: false,
        output: "Missing required parameter: package_name",
        error: "missing_param",
      };
    }

    const name = packageName.trim();

    // Basic validation: reject shell meta-characters to prevent injection.
    if (/[;&|`$(){}[\]<>!#]/.test(name)) {
      return {
        success: false,
        output: `Invalid package name: ${name}`,
        error: "invalid_name",
      };
    }

    try {
      const { stdout, stderr } = await execAsync(`npm install ${name}`, {
        timeout: 120_000,
      });
      const output = [stdout, stderr].filter(Boolean).join("\n").trim();
      return { success: true, output: output || `Installed ${name}.` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to install ${name}: ${msg}`,
        error: "install_failed",
      };
    }
  },
};

/** Runtime helper: returns true when the package can be installed silently. */
export function isTrustedPackage(packageName: string): boolean {
  return packageName.trim().startsWith(TRUSTED_PREFIX);
}
