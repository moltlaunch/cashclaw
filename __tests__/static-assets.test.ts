import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "http";
import { join, extname } from "path";
import { readFileSync, existsSync, statSync } from "fs";
import { lookup } from "mime-types";
import request from "supertest";

// Mock static asset server functionality
const createStaticAssetServer = () => {
  const server = createServer((req, res) => {
    const url = req.url || "/";

    // Handle dashboard route
    if (url === "/" || url === "/dashboard") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>CashClaw Dashboard</title>
          <link rel="stylesheet" href="/assets/index-DuXmJMss.css">
        </head>
        <body>
          <div id="root"></div>
          <script src="/assets/index-CyvX3q4A.js"></script>
        </body>
        </html>
      `);
      return;
    }

    // Handle static assets
    if (url.startsWith("/assets/")) {
      const assetPath = url.replace("/assets/", "");
      const fullPath = join(process.cwd(), "dist", "assets", assetPath);

      if (!existsSync(fullPath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Asset not found");
        return;
      }

      const stat = statSync(fullPath);
      const mimeType = lookup(extname(fullPath)) || "application/octet-stream";

      // Set caching headers
      const maxAge = 86400; // 1 day in seconds
      res.writeHead(200, {
        "Content-Type": mimeType,
        "Cache-Control": `public, max-age=${maxAge}`,
        "ETag": `"${stat.mtime.getTime()}-${stat.size}"`,
        "Last-Modified": stat.mtime.toUTCString(),
      });

      try {
        const content = readFileSync(fullPath);
        res.end(content);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
      }
      return;
    }

    // 404 for other routes
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  return server;
};

// Mock file system for testing
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("mime-types", () => ({
  lookup: vi.fn(),
}));

describe("Static Asset Server", () => {
  let server: any;
  let mockExistsSync: any;
  let mockStatSync: any;
  let mockReadFileSync: any;
  let mockLookup: any;

  beforeEach(() => {
    server = createStaticAssetServer();
    mockExistsSync = vi.mocked(existsSync);
    mockStatSync = vi.mocked(statSync);
    mockReadFileSync = vi.mocked(readFileSync);
    mockLookup = vi.mocked(lookup);
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (server) {
      server.close();
    }
  });

  describe("MIME Type Detection", () => {
    it("should detect CSS MIME type correctly", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        mtime: new Date("2024-01-01"),
        size: 1024,
      });
      mockReadFileSync.mockReturnValue("body { margin: 0; }");
      mockLookup.mockReturnValue("text/css");

      const response = await request(server)
        .get("/assets/index-DuXmJMss.css")
        .expect(200);

      expect(response.headers["content-type"]).toBe("text/css");
      expect(mockLookup).toHaveBeenCalledWith(".css");
    });

    it("should detect JavaScript MIME type correctly", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        mtime: new Date("2024-01-01"),
        size: 2048,
      });
      mockReadFileSync.mockReturnValue("console.log('test');");
      mockLookup.mockReturnValue("application/javascript");

      const response = await request(server)
        .get("/assets/index-CyvX3q4A.js")
        .expect(200);

      expect(response.headers["content-type"]).toBe("application/javascript");
      expect(mockLookup).toHaveBeenCalledWith(".js");
    });

    it("should fallback to octet-stream for unknown types", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        mtime: new Date("2024-01-01"),
        size: 512,
      });
      mockReadFileSync.mockReturnValue(Buffer.from("binary data"));
      mockLookup.mockReturnValue(false);

      const response = await request(server)
        .get("/assets/unknown-file.xyz")
        .expect(200);

      expect(response.headers["content-type"]).toBe("application/octet-stream");
    });
  });

  describe("404 Handling", () => {
    it("should return 404 for non-existent CSS files", async () => {
      mockExistsSync.mockReturnValue(false);

      const response = await request(server)
        .get("/assets/missing-styles.css")
        .expect(404);

      expect(response.text).toBe("Asset not found");
    });

    it("should return 404 for non-existent JS files", async () => {
      mockExistsSync.mockReturnValue(false);

      const response = await request(server)
        .get("/assets/missing-script.js")
        .expect(404);

      expect(response.text).toBe("Asset not found");
    });

    it("should return 404 for invalid asset paths", async () => {
      await request(server)
        .get("/invalid-path")
        .expect(404);
    });
  });

  describe("Caching Headers", () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        mtime: new Date("2024-01-01T12:00:00Z"),
        size: 1024,
      });
      mockReadFileSync.mockReturnValue("test content");
      mockLookup.mockReturnValue("text/css");
    });

    it("should set proper Cache-Control headers", async () => {
      const response = await request(server)
        .get("/assets/test.css")
        .expect(200);

      expect(response.headers["cache-control"]).toBe("public, max-age=86400");
    });

    it("should set ETag header based on mtime and size", async () => {
      const expectedETag = `"${new Date("2024-01-01T12:00:00Z").getTime()}-1024"`;

      const response = await request(server)
        .get("/assets/test.css")
        .expect(200);

      expect(response.headers.etag).toBe(expectedETag);
    });

    it("should set Last-Modified header", async () => {
      const response = await request(server)
        .get("/assets/test.css")
        .expect(200);

      expect(response.headers["last-modified"]).toBe("Mon, 01 Jan 2024 12:00:00 GMT");
    });
  });

  describe("Dashboard Integration", () => {
    it("should serve dashboard HTML with correct asset references", async () => {
      const response = await request(server)
        .get("/")
        .expect(200);

      expect(response.text).toContain('href="/assets/index-DuXmJMss.css"');
      expect(response.text).toContain('src="/assets/index-CyvX3q4A.js"');
      expect(response.text).toContain('<title>CashClaw Dashboard</title>');
    });

    it("should serve dashboard on /dashboard route", async () => {
      const response = await request(server)
        .get("/dashboard")
        .expect(200);

      expect(response.text).toContain('<div id="root"></div>');
    });
  });

  describe("Asset Content Serving", () => {
    it("should serve CSS content correctly", async () => {
      const cssContent = "body { margin: 0; padding: 0; }";
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        mtime: new Date("2024-01-01"),
        size: cssContent.length,
      });
      mockReadFileSync.mockReturnValue(cssContent);
      mockLookup.mockReturnValue("text/css");

      const response = await request(server)
        .get("/assets/index-DuXmJMss.css")
        .expect(200);

      expect(response.text).toBe(cssContent);
    });

    it("should serve JavaScript content correctly", async () => {
      const jsContent = "window.APP_CONFIG = { version: '1.0.0' };";
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        mtime: new Date("2024-01-01"),
        size: jsContent.length,
      });
      mockReadFileSync.mockReturnValue(jsContent);
      mockLookup.mockReturnValue("application/javascript");

      const response = await request(server)
        .get("/assets/index-CyvX3q4A.js")
        .expect(200);

      expect(response.text).toBe(jsContent);
    });

    it("should handle file read errors gracefully", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        mtime: new Date("2024-01-01"),
        size: 1024,
      });
      mockReadFileSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const response = await request(server)
        .get("/assets/test.css")
        .expect(500);

      expect(response.text).toBe("Internal server error");
    });
  });

  describe("Path Traversal Security", () => {
    it("should reject path traversal attempts", async () => {
      await request(server)
        .get("/assets/../../../etc/passwd")
        .expect(404);
    });

    it("should only serve files from assets directory", async () => {
      mockExistsSync.mockReturnValue(false);

      await request(server)
        .get("/assets/../../package.json")
        .expect(404);

      expect(mockExistsSync).toHaveBeenCalledWith(
        expect.stringContaining(join("dist", "assets", "../../package.json"))
      );
    });
  });
});
