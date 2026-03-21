import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MimeTypes {
  [key: string]: string;
}

const MIME_TYPES: MimeTypes = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'ETag': ''
};

export class StaticAssetServer {
  private assetsPath: string;
  private distPath: string;

  constructor() {
    this.distPath = path.join(__dirname, '../../dist');
    this.assetsPath = path.join(this.distPath, 'assets');
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  private generateETag(stats: any): string {
    return `"${stats.mtime.getTime().toString(16)}-${stats.size.toString(16)}"`;
  }

  async serveAsset(assetPath: string): Promise<{ content: Buffer; headers: Record<string, string> } | null> {
    try {
      // Remove leading slash and normalize path
      const cleanPath = assetPath.replace(/^\/+/, '');

      let fullPath: string;

      // Check if it's an assets file first
      if (cleanPath.startsWith('assets/')) {
        fullPath = path.join(this.distPath, cleanPath);
      } else {
        // Try both assets directory and dist root
        const assetsFilePath = path.join(this.assetsPath, cleanPath);
        const distFilePath = path.join(this.distPath, cleanPath);

        try {
          await fs.access(assetsFilePath);
          fullPath = assetsFilePath;
        } catch {
          try {
            await fs.access(distFilePath);
            fullPath = distFilePath;
          } catch {
            return null;
          }
        }
      }

      // Security check - ensure we're not serving files outside our directories
      const resolvedPath = path.resolve(fullPath);
      const resolvedDistPath = path.resolve(this.distPath);

      if (!resolvedPath.startsWith(resolvedDistPath)) {
        return null;
      }

      const stats = await fs.stat(fullPath);
      const content = await fs.readFile(fullPath);

      const mimeType = this.getMimeType(fullPath);
      const etag = this.generateETag(stats);

      const headers = {
        'Content-Type': mimeType,
        'Content-Length': content.length.toString(),
        'ETag': etag,
        ...CACHE_HEADERS
      };

      return { content, headers };
    } catch (error) {
      return null;
    }
  }

  async serveIndex(): Promise<{ content: Buffer; headers: Record<string, string> } | null> {
    try {
      const indexPath = path.join(this.distPath, 'index.html');
      const content = await fs.readFile(indexPath);

      const headers = {
        'Content-Type': 'text/html',
        'Content-Length': content.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      };

      return { content, headers };
    } catch (error) {
      return null;
    }
  }

  async checkIfExists(assetPath: string): Promise<boolean> {
    const result = await this.serveAsset(assetPath);
    return result !== null;
  }
}

export const staticServer = new StaticAssetServer();
