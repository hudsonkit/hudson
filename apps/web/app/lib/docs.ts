import { isPublicDoc } from "../../site/docs-policy";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { REPO_ROOT } from "./repoRoot";

const DOCS_DIR = path.join(REPO_ROOT, "docs");

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  order: number;
  section?: string;
  subsection?: string;
}

export interface Doc extends DocMeta {
  content: string;
}

/** Recursively find all .md files under a directory */
function walkDir(dir: string, prefix = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!isPublicDoc(rel)) continue;
    if (entry.isDirectory()) {
      results.push(...walkDir(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".md") && entry.name !== "index.md") {
      results.push(rel);
    }
  }

  return results;
}

/** Get all published docs sorted by section then order */
export function getAllDocs(): DocMeta[] {
  const files = walkDir(DOCS_DIR);

  return files
    .map((relPath) => {
      const slug = relPath.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(DOCS_DIR, relPath), "utf-8");
      const { data } = matter(raw);
      return {
        slug,
        title: (data.title as string) ?? slug,
        description: (data.description as string) ?? "",
        order: (data.order as number) ?? 99,
        section: (data.section as string) ?? undefined,
        subsection: (data.subsection as string) ?? undefined,
      };
    })
    .sort((a, b) => {
      // Docs without section come first, then by section name, then by order
      if (!a.section && b.section) return -1;
      if (a.section && !b.section) return 1;
      if (a.section && b.section && a.section !== b.section) {
        return a.section.localeCompare(b.section);
      }
      return a.order - b.order;
    });
}

/** Get all slugs for static generation */
export function getAllSlugs(): string[] {
  return getAllDocs().map((d) => d.slug);
}

/** Get a single doc by slug (supports nested paths like npm/sdk/hooks) */
export function getDocBySlug(slug: string): Doc | null {
  if (!isPublicDoc(slug)) return null;
  const filepath = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(filepath)) return null;

  const raw = fs.readFileSync(filepath, "utf-8");
  const { data, content } = matter(raw);

  return {
    slug,
    title: (data.title as string) ?? slug,
    description: (data.description as string) ?? "",
    order: (data.order as number) ?? 99,
    section: (data.section as string) ?? undefined,
    subsection: (data.subsection as string) ?? undefined,
    content,
  };
}
