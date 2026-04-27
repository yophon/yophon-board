import { extname, join, resolve, sep } from "node:path";

export async function serveStaticAsset(pathname: string, distDir: string): Promise<Response | null> {
  if (pathname === "/") return null;

  const root = resolve(distDir);
  const assetPath = pathname.replace(/^\/+/, "");
  const filePath = resolve(root, assetPath);
  if (!isInsideRoot(root, filePath)) return null;

  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  const isAsset = pathname.startsWith("/assets/");
  return new Response(file, {
    headers: {
      "content-type": contentTypeFor(pathname),
      "cache-control": isAsset ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    },
  });
}

export function serveIndex(distDir: string): Response {
  return new Response(Bun.file(join(distDir, "index.html")), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isInsideRoot(root: string, filePath: string): boolean {
  return filePath === root || filePath.startsWith(root + sep);
}

function contentTypeFor(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}
