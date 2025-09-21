import * as React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  Copy,
  Filter,
  FolderTree,
  Link2,
  Search,
  SortAsc,
  SortDesc,
  Plus,
} from "lucide-react";

type Item = {
  title: string;
  slug?: string;
  blobId: string;
  updatedAt?: number;
  tags?: string[];
  excerpt?: string;
  coverUrl?: string;
  authorName: string;
  authorAvatarUrl: string;
};

const A = (name: string) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
    name
  )}&radius=50`;

const ITEMS: Item[] = [
  {
    title: "Welcome to ProCMS",
    slug: "welcome",
    blobId: "XKmiOgGu0ak2QTva0C3fZXo6Ca0ln8GY_byHzBt19-s",
    updatedAt: Date.now() - 1000 * 60 * 23,
    tags: ["docs", "intro"],
    excerpt:
      "Getting started with the editor, assets, and Walrus publish flow.",
    authorName: "jolly-sapphire.sui",
    authorAvatarUrl: A("jolly-sapphire.sui"),
  },
  {
    title: "Product Changelog – v0.2",
    slug: "changelog-0-2",
    blobId: "BLOB_CHANGELOG_002",
    updatedAt: Date.now() - 1000 * 60 * 60 * 8,
    tags: ["changelog", "release"],
    excerpt: "Quality-of-life improvements, publishing tips, and fixes.",
    authorName: "dev-nebula.sui",
    authorAvatarUrl: A("dev-nebula.sui"),
  },
  {
    title: "Design System Notes",
    slug: "design-system",
    blobId: "BLOB_DESIGN_003",
    updatedAt: Date.now() - 1000 * 60 * 60 * 26,
    tags: ["design", "ui"],
    excerpt: "Foundations, typography, and component guidelines.",
    authorName: "pixel-otter.sui",
    authorAvatarUrl: A("pixel-otter.sui"),
  },
  {
    title: "Content Strategy 2025-Q4",
    slug: "content-2025-q4",
    blobId: "BLOB_CONTENT_004",
    updatedAt: Date.now() - 1000 * 60 * 60 * 52,
    tags: ["strategy", "marketing"],
    excerpt: "Themes, cadence, and KPIs for the next quarter.",
    authorName: "mkt-scout.sui",
    authorAvatarUrl: A("mkt-scout.sui"),
  },
  {
    title: "Engineering Onboarding",
    slug: "eng-onboarding",
    blobId: "BLOB_ENG_005",
    updatedAt: Date.now() - 1000 * 60 * 60 * 72,
    tags: ["engineering", "docs"],
    excerpt: "Local dev, environments, and publishing checklists.",
    authorName: "build-wizard.sui",
    authorAvatarUrl: A("build-wizard.sui"),
  },
  {
    title: "SEO Playbook",
    slug: "seo-playbook",
    blobId: "BLOB_SEO_006",
    updatedAt: Date.now() - 1000 * 60 * 60 * 6,
    tags: ["marketing", "seo"],
    excerpt: "Keywords, structure, and technical hygiene.",
    authorName: "rank-fox.sui",
    authorAvatarUrl: A("rank-fox.sui"),
  },
  {
    title: "Brand Voice & Tone",
    slug: "brand-voice",
    blobId: "BLOB_BRAND_007",
    updatedAt: Date.now() - 1000 * 60 * 60 * 90,
    tags: ["brand", "content"],
    excerpt: "Personality traits, do's & don'ts, examples.",
    authorName: "vibe-curator.sui",
    authorAvatarUrl: A("vibe-curator.sui"),
  },
  {
    title: "Release Runbook",
    slug: "release-runbook",
    blobId: "BLOB_RUNBOOK_008",
    updatedAt: Date.now() - 1000 * 60 * 12,
    tags: ["ops", "release"],
    excerpt: "Preflight, rollout, validation, and rollback steps.",
    authorName: "ops-heron.sui",
    authorAvatarUrl: A("ops-heron.sui"),
  },
  {
    title: "AI Content Guardrails",
    slug: "ai-guardrails",
    blobId: "BLOB_AI_009",
    updatedAt: Date.now() - 1000 * 60 * 60 * 4,
    tags: ["ai", "policy"],
    excerpt: "Prompts, red lines, and review guidance.",
    authorName: "policy-panda.sui",
    authorAvatarUrl: A("policy-panda.sui"),
  },
  {
    title: "Roadmap Overview",
    slug: "roadmap",
    blobId: "BLOB_ROADMAP_010",
    updatedAt: Date.now() - 1000 * 60 * 60 * 120,
    tags: ["roadmap", "planning"],
    excerpt: "Near-term focus, dependencies, and milestones.",
    authorName: "pm-orbit.sui",
    authorAvatarUrl: A("pm-orbit.sui"),
  },
  {
    title: "Docs IA Proposal",
    slug: "docs-ia",
    blobId: "BLOB_DOCS_011",
    updatedAt: Date.now() - 1000 * 60 * 35,
    tags: ["docs", "ia"],
    excerpt: "New structure for navigation and discoverability.",
    authorName: "info-archer.sui",
    authorAvatarUrl: A("info-archer.sui"),
  },
  {
    title: "Walrus Storage Deep Dive",
    slug: "walrus-deep-dive",
    blobId: "BLOB_WALRUS_012",
    updatedAt: Date.now() - 1000 * 60 * 60 * 14,
    tags: ["walrus", "sui"],
    excerpt: "Blobs, epochs, tips, and integration patterns.",
    authorName: "seal-hacker.sui",
    authorAvatarUrl: A("seal-hacker.sui"),
  },
];

export default function Directory() {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<"recent" | "title">("recent");
  const [ascending, setAscending] = React.useState(false);
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const base = React.useMemo(() => window.location.origin, []);

  const tags = React.useMemo(() => {
    const t = new Map<string, number>();
    for (const it of ITEMS)
      (it.tags || []).forEach((x) => t.set(x, (t.get(x) || 0) + 1));
    return [...t.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, []);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = ITEMS.filter((it) => {
      const matchesQ =
        !needle ||
        it.title.toLowerCase().includes(needle) ||
        (it.excerpt || "").toLowerCase().includes(needle) ||
        (it.slug || "").toLowerCase().includes(needle) ||
        (it.tags || []).some((t) => t.toLowerCase().includes(needle)) ||
        it.authorName.toLowerCase().includes(needle);
      const matchesTag = !activeTag || (it.tags || []).includes(activeTag);
      return matchesQ && matchesTag;
    });
    if (sort === "recent")
      arr = arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    else arr = arr.sort((a, b) => a.title.localeCompare(b.title));
    if (ascending) arr = arr.slice().reverse();
    return arr;
  }, [q, sort, ascending, activeTag]);

  return (
    <div className="h-screen w-screen bg-background flex flex-col">
      <div className="flex h-14 items-center gap-3 border-b px-4">
        <FolderTree className="h-5 w-5" />
        <div className="text-lg font-semibold">Library</div>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild className="gap-2">
            <Link to="/editor">
              <Plus className="h-4 w-4" />
              Create
            </Link>
          </Button>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="pl-8"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                {ascending ? (
                  <SortAsc className="h-4 w-4" />
                ) : (
                  <SortDesc className="h-4 w-4" />
                )}
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => setSort("recent")}
                className={sort === "recent" ? "font-semibold" : ""}
              >
                Recent
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSort("title")}
                className={sort === "title" ? "font-semibold" : ""}
              >
                Title
              </DropdownMenuItem>
              <Separator className="my-1" />
              <DropdownMenuItem onClick={() => setAscending((v) => !v)}>
                {ascending ? "Ascending" : "Descending"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                {activeTag ?? "Tags"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => setActiveTag(null)}
                className={!activeTag ? "font-semibold" : ""}
              >
                All tags
              </DropdownMenuItem>
              <Separator className="my-1" />
              {tags.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onClick={() => setActiveTag(t)}
                  className={activeTag === t ? "font-semibold" : ""}
                >
                  {t}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs defaultValue="grid" className="px-4 pt-3">
        <TabsList>
          <TabsTrigger value="grid">Grid</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>
      </Tabs>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-6xl p-4">
          {filtered.length === 0 ? (
            <EmptyState query={q} clear={() => setQ("")} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((it) => (
                <DirectoryCard key={it.blobId} item={it} base={base} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t px-4 py-2 text-xs text-muted-foreground">
        {filtered.length} item{filtered.length === 1 ? "" : "s"} ·{" "}
        {activeTag ? `tag: ${activeTag}` : "all tags"}
      </div>
    </div>
  );
}

function DirectoryCard({ item, base }: { item: Item; base: string }) {
  const [copied, setCopied] = React.useState(false);
  const href = `/content/${item.blobId}`;
  const abs = `${base}${href}`;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(abs);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {}
  };
  return (
    <Card className="group overflow-hidden transition-colors hover:border-primary/50">
      {item.coverUrl && (
        <div className="h-32 w-full overflow-hidden bg-muted">
          <img
            src={item.coverUrl}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        </div>
      )}
      <CardHeader className="pb-2">
        <CardTitle className="line-clamp-1">{item.title}</CardTitle>
        <div className="mt-2 flex items-center gap-2">
          <img
            src={item.authorAvatarUrl}
            alt=""
            className="h-5 w-5 rounded-full ring-1 ring-border"
          />
          <span className="text-xs text-muted-foreground">
            {item.authorName}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {(item.tags || []).map((t) => (
            <Badge variant="secondary" key={t}>
              {t}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {item.excerpt}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{item.slug ? `/${item.slug}` : ""}</span>
          <span>
            {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ""}
          </span>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to={href}>
              <Link2 className="h-4 w-4" />
              Open
            </Link>
          </Button>
          <Button onClick={onCopy} variant="ghost" size="sm" className="gap-2">
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ query, clear }: { query: string; clear: () => void }) {
  return (
    <Card className="mx-auto w/full max-w-xl">
      <CardHeader>
        <CardTitle>No results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {query ? (
            <>
              Nothing matched <span className="font-mono">"{query}"</span>. Try
              a different search or clear filters.
            </>
          ) : (
            "No content yet. Publish from the Editor to populate the library."
          )}
        </p>
        {query && (
          <Button onClick={clear} variant="outline" className="gap-2">
            <Search className="h-4 w-4" />
            Clear search
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
