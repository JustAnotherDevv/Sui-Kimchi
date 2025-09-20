import * as React from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, RefreshCw } from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";

const READ_HOST =
  import.meta.env.VITE_WALRUS_READ_HOST?.replace(/\/+$/, "") ||
  "https://seal.testnet.walrus.space";

export default function Content() {
  const { blobid } = useParams<{ blobid: string }>();
  const [urlTried, setUrlTried] = React.useState<string | null>(null);
  const [frontmatter, setFrontmatter] = React.useState<{ title?: string; slug?: string }>({});
  const [markdown, setMarkdown] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const candidateUrls = React.useMemo(() => {
    if (!blobid) return [];
    return [
      `${READ_HOST}/v1/blobs/${blobid}`,
      `${READ_HOST}/v1/blob/${blobid}`,
      `${READ_HOST}/${blobid}`,
    ];
  }, [blobid]);

  const load = React.useCallback(async () => {
    if (!blobid) return;
    setLoading(true);
    setErr(null);
    setMarkdown("");
    setFrontmatter({});
    setUrlTried(null);

    for (const u of candidateUrls) {
      try {
        const res = await fetch(u, { headers: { Accept: "text/plain, */*" } });
        if (!res.ok) continue;
        const body = await res.text();
        const { meta, body: md } = parseFrontmatter(body);
        setFrontmatter(meta);
        setMarkdown(md);
        setUrlTried(u);

        const unresolved = md.match(/\]\(asset:[^)]+\)/g);
        if (unresolved?.length) {
          console.warn("[Content] Unresolved asset tokens in blob — images won't render:", unresolved.slice(0,5));
        }

        setLoading(false);
        return;
      } catch {}
    }

    setLoading(false);
    setErr(
      `Failed to fetch blob ${blobid}. Tried ${candidateUrls.map((s) => new URL(s).pathname).join(", ")} on ${READ_HOST}.`
    );
  }, [blobid, candidateUrls]);

  React.useEffect(() => { void load(); }, [load]);

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(markdown); setCopied(true); setTimeout(() => setCopied(false), 1100); } catch {}
  };

  if (!blobid) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              No <code>blobid</code> in the URL. Go to <code>/content/&lt;blobid&gt;</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background">
      <div className="mx-auto max-w-5xl p-4 space-y-4 h-full flex flex-col">
        <div className="flex items-center gap-3">
          <Input value={blobid} readOnly className="font-mono" />
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Reload"}
          </Button>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xl font-semibold truncate">{frontmatter.title || "Untitled"}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {urlTried ? <>Source: <span className="font-mono">{urlTried}</span></> : "Trying endpoints…"}
            </div>
          </div>
          <Button size="sm" variant="ghost" className="gap-2" onClick={onCopy} disabled={!markdown}>
            {copied ? <Copy className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy MD"}
          </Button>
        </div>

        <Card className="flex-1 min-h-0">
          <CardContent className="p-0 h-full">
            <div className="border-b px-4 py-2 text-xs text-muted-foreground">
              {frontmatter.slug ? `/${frontmatter.slug}` : ""}
            </div>
            <ScrollArea className="h-[calc(100%-2rem)]">
              <div className="p-5">
                {loading ? (
                  <div className="text-sm text-muted-foreground">Loading blob…</div>
                ) : err ? (
                  <div className="text-sm text-red-500">{err}</div>
                ) : markdown ? (
                  <article className="prose max-w-none dark:prose-invert prose-pre:p-0">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={(u) => u}
                      components={{
                        img(props) {
                          return <img {...props} alt={props.alt ?? "image"} className="max-h-[60vh] w-auto" />;
                        },
                        code({ inline, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className ?? "");
                          if (inline) {
                            return (
                              <code className="rounded bg-muted px-1 py-0.5 text-sm" {...props}>
                                {children}
                              </code>
                            );
                          }
                          const text = Array.isArray(children) ? children.join("") : String(children ?? "");
                          return <CodeBlock lang={match?.[1]} code={text.replace(/\n$/, "")} />;
                        },
                      }}
                    >
                      {markdown}
                    </ReactMarkdown>
                  </article>
                ) : (
                  <div className="text-sm text-muted-foreground">Empty response.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground">
          Read host:&nbsp;<span className="font-mono">{READ_HOST}</span>
        </div>
      </div>
    </div>
  );
}

function parseFrontmatter(text: string): { meta: { title?: string; slug?: string }; body: string } {
  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      const metaRaw = text.slice(3, end).trim();
      const body = text.slice(end + 4).replace(/^\n+/, "");
      const meta: any = {};
      metaRaw.split(/\n+/).forEach((line) => {
        const m = line.match(/^(\w+):\s*(.*)$/);
        if (!m) return;
        meta[m[1]] = m[2].trim();
      });
      return { meta, body };
    }
  }
  return { meta: {}, body: text };
}

function CodeBlock({ code, lang }: { code: string; lang?: string | null }) {
  const [copied, setCopied] = React.useState(false);
  let html = "";
  try {
    if (lang) html = hljs.highlight(code, { language: lang }).value;
    else html = hljs.highlightAuto(code).value;
  } catch {
    html = hljs.escapeHTML(code);
  }
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
  };
  const label = (lang ?? "code").toUpperCase();
  return (
    <div className="relative overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
        <Button onClick={onCopy} size="sm" variant="ghost" className="gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="m-0 max-h-[70vh] overflow-auto p-3 text-sm hljs bg-neutral-900 text-neutral-100 dark:bg-neutral-900 dark:text-neutral-100 rounded-b-lg">
        <code className={lang ? `language-${lang}` : undefined} dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
