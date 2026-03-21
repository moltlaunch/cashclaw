import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

const PROJECT_ROOT = resolve(__dirname, "..");

describe("Build Verification", () => {
  describe("UI Build Output", () => {
    it("should have dist/ui directory", () => {
      const uiDistPath = join(PROJECT_ROOT, "dist", "ui");
      expect(existsSync(uiDistPath)).toBe(true);
    });

    it("should contain index.html in ui build", () => {
      const indexPath = join(PROJECT_ROOT, "dist", "ui", "index.html");
      expect(existsSync(indexPath)).toBe(true);

      const content = readFileSync(indexPath, "utf8");
      expect(content).toContain("<!DOCTYPE html>");
      expect(content).toContain("<div id=\"root\">");
    });

    it("should contain bundled JavaScript assets", () => {
      const uiDistPath = join(PROJECT_ROOT, "dist", "ui");
      const assetsPath = join(uiDistPath, "assets");

      expect(existsSync(assetsPath)).toBe(true);

      const files = require("fs").readdirSync(assetsPath);
      const jsFiles = files.filter((file: string) => file.endsWith(".js"));
      const cssFiles = files.filter((file: string) => file.endsWith(".css"));

      expect(jsFiles.length).toBeGreaterThan(0);
      expect(cssFiles.length).toBeGreaterThan(0);

      // Verify main bundle exists with proper naming pattern
      const mainBundle = jsFiles.find((file: string) => file.includes("index-") && file.endsWith(".js"));
      expect(mainBundle).toBeDefined();
    });

    it("should have non-empty asset files", () => {
      const assetsPath = join(PROJECT_ROOT, "dist", "ui", "assets");
      const files = require("fs").readdirSync(assetsPath);

      files.forEach((file: string) => {
        const filePath = join(assetsPath, file);
        const stats = statSync(filePath);
        expect(stats.size).toBeGreaterThan(0);
      });
    });
  });

  describe("CLI Build Output", () => {
    it("should have dist/cli directory", () => {
      const cliDistPath = join(PROJECT_ROOT, "dist", "cli");
      expect(existsSync(cliDistPath)).toBe(true);
    });

    it("should contain main CLI entry point", () => {
      const cliIndexPath = join(PROJECT_ROOT, "dist", "cli", "index.js");
      expect(existsSync(cliIndexPath)).toBe(true);

      const content = readFileSync(cliIndexPath, "utf8");
      expect(content).toContain("#!/usr/bin/env node");
    });
  });

  describe("Package.json Verification", () => {
    let packageJson: any;

    beforeEach(() => {
      const packagePath = join(PROJECT_ROOT, "package.json");
      const content = readFileSync(packagePath, "utf8");
      packageJson = JSON.parse(content);
    });

    it("should have correct bin configuration", () => {
      expect(packageJson.bin).toBeDefined();
      expect(packageJson.bin["cashclaw-agent"]).toBe("./dist/cli/index.js");
    });

    it("should include dist folder in files array", () => {
      expect(packageJson.files).toBeDefined();
      expect(packageJson.files).toContain("dist");
    });

    it("should have proper main entry point", () => {
      expect(packageJson.main).toBe("./dist/cli/index.js");
    });

    it("should have build scripts defined", () => {
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts["build:all"]).toBeDefined();
      expect(packageJson.scripts["build:ui"]).toBeDefined();
      expect(packageJson.scripts["build:cli"]).toBeDefined();
    });
  });

  describe("Build Process Integration", () => {
    it("should successfully run build:all command", () => {
      try {
        execSync("npm run build:all", {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
          timeout: 60000
        });
      } catch (error) {
        throw new Error(`Build failed: ${error}`);
      }
    });

    it("should have proper file permissions on CLI executable", () => {
      const cliPath = join(PROJECT_ROOT, "dist", "cli", "index.js");
      if (process.platform !== "win32") {
        const stats = statSync(cliPath);
        const mode = stats.mode & parseInt("777", 8);
        expect(mode & parseInt("111", 8)).toBeTruthy(); // Should be executable
      }
    });
  });

  describe("NPM Package Readiness", () => {
    it("should verify all required files exist for publishing", () => {
      const requiredFiles = [
        "dist/ui/index.html",
        "dist/ui/assets",
        "dist/cli/index.js",
        "package.json",
        "README.md"
      ];

      requiredFiles.forEach(filePath => {
        const fullPath = join(PROJECT_ROOT, filePath);
        expect(existsSync(fullPath)).toBe(true);
      });
    });

    it("should verify UI assets are properly referenced in index.html", () => {
      const indexPath = join(PROJECT_ROOT, "dist", "ui", "index.html");
      const content = readFileSync(indexPath, "utf8");

      // Extract asset references from HTML
      const scriptMatches = content.match(/src="\/assets\/[^"]+\.js"/g);
      const linkMatches = content.match(/href="\/assets\/[^"]+\.css"/g);

      expect(scriptMatches).toBeDefined();
      expect(scriptMatches!.length).toBeGreaterThan(0);

      // Verify referenced assets actually exist
      scriptMatches?.forEach(match => {
        const assetPath = match.match(/\/assets\/([^"]+)/)?.[1];
        if (assetPath) {
          const fullAssetPath = join(PROJECT_ROOT, "dist", "ui", "assets", assetPath);
          expect(existsSync(fullAssetPath)).toBe(true);
        }
      });
    });
  });

  describe("Dashboard Accessibility", () => {
    it("should have proper MIME type configuration", () => {
      const indexPath = join(PROJECT_ROOT, "dist", "ui", "index.html");
      const content = readFileSync(indexPath, "utf8");

      // Check for proper script type attributes
      expect(content).toMatch(/type="module"/);
    });

    it("should verify static asset serving capability", () => {
      const uiPath = join(PROJECT_ROOT, "dist", "ui");
      const assetsPath = join(uiPath, "assets");

      // Verify directory structure supports static serving
      expect(existsSync(uiPath)).toBe(true);
      expect(existsSync(assetsPath)).toBe(true);

      const files = require("fs").readdirSync(assetsPath);
      const staticFiles = files.filter((file: string) =>
        file.endsWith(".js") || file.endsWith(".css") || file.endsWith(".png") || file.endsWith(".svg")
      );

      expect(staticFiles.length).toBeGreaterThan(0);
    });
  });
});
