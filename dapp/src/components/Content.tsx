import * as React from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Copy, Check, RefreshCw } from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";

const READ_HOST =
  import.meta.env.VITE_WALRUS_READ_HOST?.replace(/\/+$/, "") ||
  "https://seal.testnet.walrus.space";

type Comment = {
  id: string;
  author: string;
  avatar: string;
  text: string;
  at: number;
};

const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
    seed
  )}&radius=50`;

export default function Content() {
  const { blobid } = useParams<{ blobid: string }>();
  const [urlTried, setUrlTried] = React.useState<string | null>(null);
  const [frontmatter, setFrontmatter] = React.useState<{
    title?: string;
    slug?: string;
    author?: string;
  }>({});
  const [markdown, setMarkdown] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const [comments, setComments] = React.useState<Comment[]>(() => [
    {
      id: "c1",
      author: "pixel-otter.sui",
      avatar: avatar("pixel-otter.sui"),
      text: "Loved the spacing and the code samples — super readable.",
      at: Date.now() - 1000 * 60 * 45,
    },
    {
      id: "c2",
      author: "seal-hacker.sui",
      avatar: avatar("seal-hacker.sui"),
      text: "Walrus integration is slick. Would be cool to see a publish status badge.",
      at: Date.now() - 1000 * 60 * 60 * 3,
    },
    {
      id: "c3",
      author: "jolly-sapphire.sui",
      avatar: avatar("jolly-sapphire.sui"),
      text: "Curious if you’ll support drafts with private blobs?",
      at: Date.now() - 1000 * 60 * 60 * 8,
    },
  ]);
  const [pendingName, setPendingName] = React.useState("you.sui");
  const [pendingText, setPendingText] = React.useState("");

  const authorName = frontmatter.author || "jolly-sapphire.sui";
  const authorAvatarUrl = React.useMemo(() => avatar(authorName), [authorName]);

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
          console.warn(
            "[Content] Unresolved asset tokens in blob — images won't render:",
            unresolved.slice(0, 5)
          );
        }
        setLoading(false);
        return;
      } catch {}
    }

    setLoading(false);
    setErr(
      `Failed to fetch blob ${blobid}. Tried ${candidateUrls
        .map((s) => new URL(s).pathname)
        .join(", ")} on ${READ_HOST}.`
    );
  }, [blobid, candidateUrls]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1100);
    } catch {}
  };

  const addComment = () => {
    const text = pendingText.trim();
    const name = pendingName.trim() || "you.sui";
    if (!text) return;
    setComments((prev) => [
      {
        id: `c${Date.now()}`,
        author: name.endsWith(".sui") ? name : `${name}.sui`,
        avatar: avatar(name),
        text,
        at: Date.now(),
      },
      ...prev,
    ]);
    setPendingText("");
  };

  if (!blobid) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              No <code>blobid</code> in the URL. Go to{" "}
              <code>/content/&lt;blobid&gt;</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-screen bg-background">
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      <div className="mx-auto max-w-6xl p-5 md:p-6 lg:p-8 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <Input value={blobid} readOnly className="font-mono" />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={load}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Loading…" : "Reload"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-2"
              onClick={onCopy}
              disabled={!markdown}
            >
              {copied ? (
                <Copy className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy MD"}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={authorAvatarUrl}
              alt=""
              className="h-9 w-9 rounded-full ring-1 ring-border"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium leading-5 truncate">
                {authorName}
              </div>
              <div className="text-xs text-muted-foreground">
                {frontmatter.slug ? `/${frontmatter.slug}` : "unlisted"}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {urlTried ? (
              <>
                Source: <span className="font-mono">{urlTried}</span>
              </>
            ) : (
              "Trying endpoints…"
            )}
          </div>
        </div>

        <TipBanner authorName={authorName} />

        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          {frontmatter.title || "Untitled"}
        </h1>

        <Card className="border-muted/60">
          <CardContent className="p-0">
            <div className="px-5 md:px-8 lg:px-12 py-6 md:py-10 lg:py-14">
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  Loading blob…
                </div>
              ) : err ? (
                <div className="text-sm text-red-500">{err}</div>
              ) : markdown ? (
                <article
                  className="
                    prose prose-lg max-w-3xl mx-auto dark:prose-invert
                    prose-pre:m-0 prose-pre:p-0
                    prose-p:leading-8 md:prose-p:leading-9
                    prose-li:leading-8 md:prose-li:leading-9
                    prose-p:my-7 md:prose-p:my-8
                    prose-ul:my-7 md:prose-ul:my-8
                    prose-ol:my-7 md:prose-ol:my-8
                    prose-blockquote:my-10 md:prose-blockquote:my-12
                    prose-img:my-12
                    prose-h1:mt-0 prose-h1:mb-8 md:prose-h1:mb-10
                    prose-h2:mt-16 prose-h2:mb-6 md:prose-h2:mt-20 md:prose-h2:mb-7
                    prose-h3:mt-12 prose-h3:mb-5
                  "
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={(u) => u}
                    components={{
                      img(props) {
                        return (
                          <img
                            {...props}
                            alt={props.alt ?? "image"}
                            className="mx-auto my-12 max-h-[70vh] w-auto rounded-xl"
                          />
                        );
                      },
                      code({ inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className ?? "");
                        if (inline) {
                          return (
                            <code
                              className="rounded bg-muted px-1.5 py-0.5 text-[0.95em]"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        }
                        const text = Array.isArray(children)
                          ? children.join("")
                          : String(children ?? "");
                        return (
                          <CodeBlock
                            lang={match?.[1]}
                            code={text.replace(/\n$/, "")}
                          />
                        );
                      },
                    }}
                  >
                    {markdown}
                  </ReactMarkdown>
                </article>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Empty response.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Comments
          comments={comments}
          pendingName={pendingName}
          pendingText={pendingText}
          setPendingName={setPendingName}
          setPendingText={setPendingText}
          onAdd={addComment}
        />

        <div className="text-xs text-muted-foreground">
          Read host:&nbsp;<span className="font-mono">{READ_HOST}</span>
        </div>
      </div>
    </div>
  );
}

function TipBanner({ authorName }: { authorName: string }) {
  const [amount, setAmount] = React.useState<number>(0.5);
  const onTip = () => {
    console.log(`[Tip] Sent ${amount} SUI to ${authorName}`);
    alert(`Thanks! You tipped ${amount} SUI to ${authorName}.`);
  };
  return (
    <div className="relative overflow-hidden rounded-xl ring-1 ring-border bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -inset-y-1 -left-1 w-1/3 bg-white/25 blur-2xl"
          style={{ animation: "shimmer 2.6s linear infinite" }}
        />
      </div>
      <div className="relative z-10 px-5 md:px-8 lg:px-10 py-5 md:py-6 lg:py-7 text-white">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-sm/6 opacity-90">Support the author</div>
            <div className="text-xl md:text-2xl font-semibold tracking-tight">
              Tip {authorName}
            </div>
            <p className="mt-1 text-sm/6 opacity-90">
              Show appreciation with a small SUI tip.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              step={0.1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-28 bg-white/10 text-white placeholder:text-white/70 border-white/30 focus-visible:ring-white"
              placeholder="0.5"
            />
            <Button
              onClick={onTip}
              className="bg-white text-black hover:bg-white/90"
            >
              Tip in SUI
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Comments({
  comments,
  pendingName,
  pendingText,
  setPendingName,
  setPendingText,
  onAdd,
}: {
  comments: {
    id: string;
    author: string;
    avatar: string;
    text: string;
    at: number;
  }[];
  pendingName: string;
  pendingText: string;
  setPendingName: (v: string) => void;
  setPendingText: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <Card className="border-muted/60">
      <CardContent className="p-0">
        <div className="px-5 md:px-8 lg:px-10 py-5 md:py-7">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Comments</h2>
            <div className="text-xs text-muted-foreground">
              {comments.length} total
            </div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-[160px_1fr]">
            <Input
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              placeholder="your-handle.sui"
              className="sm:col-span-1"
            />
            <div className="flex gap-2 sm:col-span-1">
              <Input
                value={pendingText}
                onChange={(e) => setPendingText(e.target.value)}
                placeholder="Write a comment…"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onAdd();
                  }
                }}
              />
              <Button onClick={onAdd}>Post</Button>
            </div>
          </div>

          <ul className="space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="flex items-start gap-3">
                <img
                  src={c.avatar}
                  alt=""
                  className="h-8 w-8 rounded-full ring-1 ring-border"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.author}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {timeAgo(c.at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-7 md:leading-8">
                    {c.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function parseFrontmatter(text: string): {
  meta: { title?: string; slug?: string; author?: string };
  body: string;
} {
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
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  const label = (lang ?? "code").toUpperCase();
  return (
    <div className="relative overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          {label}
        </span>
        <Button onClick={onCopy} size="sm" variant="ghost" className="gap-2">
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="m-0 overflow-auto p-4 md:p-5 text-sm hljs bg-neutral-900 text-neutral-100 dark:bg-neutral-900 dark:text-neutral-100 rounded-b-lg">
        <code
          className={lang ? `language-${lang}` : undefined}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  );
}

function timeAgo(ts: number) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
