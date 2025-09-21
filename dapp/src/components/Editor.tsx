import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  ImagePlus,
  Trash2,
  Download,
  Upload,
  FilePlus2,
  MoreHorizontal,
  Eye,
  PencilLine,
  Columns,
  Hash,
  CloudUpload,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";
import { WalrusClient } from "@mysten/walrus";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import WALRUS_WASM_URL from "@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url";

const WALRUS_NETWORK: "testnet" | "mainnet" | "localnet" =
  (import.meta.env.VITE_WALRUS_NETWORK as any) ?? "testnet";
const SUI_RPC_URL =
  import.meta.env.VITE_SUI_RPC_URL ?? getFullnodeUrl(WALRUS_NETWORK);
const UPLOAD_RELAY_HOST =
  import.meta.env.VITE_WALRUS_UPLOAD_RELAY ??
  "https://upload-relay.testnet.walrus.space";
const TIP_MAX: number = Number(import.meta.env.VITE_WALRUS_TIP_MAX ?? 1000000);

type Asset = { id: string; name: string; url: string };
type DocState = {
  title: string;
  slug: string;
  markdown: string;
  assets: Record<string, Asset>;
  updatedAt: number;
};
const LS_KEY = "procms:doc";

export default function ProCMS() {
  const [state, setState] = React.useState<DocState>(() => loadFromLS());
  const [saveState, setSaveState] = React.useState<
    "saved" | "saving" | "dirty"
  >("saved");
  const [view, setView] = React.useState<"edit" | "preview" | "split">("split");
  const [publishing, setPublishing] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const editorRef = React.useRef<HTMLTextAreaElement>(null);

  const signer = React.useMemo(() => {
    const b64 = import.meta.env.VITE_SUI_PRIVATE_KEY_BASE64 as
      | string
      | undefined;
    if (!b64) return undefined;
    try {
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (raw.length !== 32) return undefined;
      return Ed25519Keypair.fromSecretKey(raw);
    } catch {
      return undefined;
    }
  }, []);

  const walrus = React.useMemo(() => {
    const sui = new SuiClient({ url: SUI_RPC_URL });
    // @ts-ignore
    return sui.$extend(
      WalrusClient.experimental_asClientExtension({
        network: WALRUS_NETWORK,
        uploadRelay: { host: UPLOAD_RELAY_HOST, sendTip: { max: TIP_MAX } },
        wasmUrl: WALRUS_WASM_URL,
      })
    );
  }, []);

  const setNow = React.useCallback((updater: (s: DocState) => DocState) => {
    setState((s) => ({ ...updater(s), updatedAt: Date.now() }));
  }, []);

  React.useEffect(() => {
    setSaveState("dirty");
    const t = setTimeout(() => {
      const payload = { ...state, updatedAt: Date.now() } as DocState;
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      setSaveState("saved");
    }, 500);
    return () => clearTimeout(t);
  }, [state]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        exportMarkdown(state);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const insertAtCursor = (text: string) => {
    const el = editorRef.current;
    if (!el) return setNow((s) => ({ ...s, markdown: s.markdown + text }));
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setNow((s) => ({ ...s, markdown: next }));
    requestAnimationFrame(() => {
      const pos = start + text.length;
      el.selectionStart = el.selectionEnd = pos;
      el.focus();
    });
  };

  const handleImagePick = () => imageInputRef.current?.click();

  const handleImageFile = async (f: File) => {
    if (!f || !f.type.startsWith("image/")) return;
    const id = genId();
    const url = await fileToDataUrl(f);
    const asset: Asset = { id, name: f.name, url };
    setNow((s) => ({ ...s, assets: { ...s.assets, [id]: asset } }));
    insertAtCursor(`\n![${f.name}](asset:${id})\n`);
  };

  const onImageInputChange: React.ChangeEventHandler<HTMLInputElement> = async (
    e
  ) => {
    const f = e.target.files?.[0];
    if (f) await handleImageFile(f);
    e.currentTarget.value = "";
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) await handleImageFile(f);
  };

  const onPaste: React.ClipboardEventHandler<HTMLTextAreaElement> = async (
    e
  ) => {
    const item = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith("image/")
    );
    if (item) {
      const f = item.getAsFile();
      if (f) await handleImageFile(f);
      e.preventDefault();
    }
  };

  const removeAsset = (id: string) => {
    setNow((s) => {
      const { [id]: _, ...rest } = s.assets;
      return {
        ...s,
        assets: rest,
        markdown: s.markdown.replaceAll(`(asset:${id})`, "(removed-asset)"),
      };
    });
  };

  const urlTransform = React.useCallback(
    (v: string) =>
      v.startsWith("asset:") ? state.assets[v.slice(6)]?.url ?? v : v,
    [state.assets]
  );

  const stats = React.useMemo(() => getStats(state.markdown), [state.markdown]);

  const newDocument = () => {
    setNow(() => ({
      title: "Untitled",
      slug: slugify("untitled"),
      markdown: starterMd,
      assets: {},
      updatedAt: Date.now(),
    }));
  };

  const importFromFile = () => fileInputRef.current?.click();

  const onImportChange: React.ChangeEventHandler<HTMLInputElement> = async (
    e
  ) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const parsed = parseFrontmatter(text);
    setNow((s) => ({
      ...s,
      title: parsed.meta.title ?? s.title,
      slug: parsed.meta.slug ?? s.slug,
      markdown: parsed.body,
    }));
    e.currentTarget.value = "";
  };

  const publishToWalrus = async () => {
    if (publishing) return;
    if (!signer) {
      alert(
        "No signer configured. Set VITE_SUI_PRIVATE_KEY_BASE64 and fund it on testnet."
      );
      return;
    }
    setPublishing(true);
    try {
      const materialized = materializeAssets(state.markdown, state.assets);
      const fm = `---\ntitle: ${state.title}\nslug: ${state.slug}\n---\n\n`;
      const finalMd = fm + materialized;
      const bytes = new TextEncoder().encode(finalMd);
      // @ts-ignore
      const resp = await walrus.walrus.writeBlob({
        blob: bytes,
        deletable: false,
        epochs: 1,
        signer,
      });
      console.log("[Walrus publish] OK:", resp);
      alert(`Published! blobId: ${resp.blobId}`);
      setSaveState("saved");
    } catch (err: any) {
      console.error("[Walrus publish] error:", err);
      const msg = String(err?.message ?? err);
      if (
        msg.includes("missing the transaction ID") ||
        msg.includes("requires them to check the tip")
      ) {
        alert(
          "Relay requires a tip. Increase VITE_WALRUS_TIP_MAX (e.g. 5000000) and try again."
        );
      } else {
        alert("Walrus publish failed. Check console.");
      }
    } finally {
      setPublishing(false);
    }
  };

  const gridCols = view === "split" ? "md:grid-cols-2" : "md:grid-cols-1";
  const centerIfSolo = view !== "split" ? "items-center" : "";
  const maybeBorderR = view === "split" ? "border-r" : "";

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-background"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex h-16 items-center gap-3 border-b px-4 md:px-6">
        <PencilLine className="h-5 w-5" />
        <Input
          value={state.title}
          onChange={(e) => setNow((s) => ({ ...s, title: e.target.value }))}
          placeholder="Title"
          className="max-w-sm"
        />
        <div className="hidden md:flex items-center gap-2">
          <Hash className="h-4 w-4 text-muted-foreground" />
          <Input
            value={state.slug}
            onChange={(e) =>
              setNow((s) => ({ ...s, slug: slugify(e.target.value) }))
            }
            placeholder="slug"
            className="w-48"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant={
                    saveState === "saved"
                      ? "secondary"
                      : saveState === "saving"
                      ? "outline"
                      : "destructive"
                  }
                >
                  {saveState === "saved"
                    ? "Saved"
                    : saveState === "saving"
                    ? "Saving…"
                    : "Unsaved"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Autosaves to localStorage</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as typeof view)}
            className="hidden md:block"
          >
            <TabsList>
              <TabsTrigger value="edit">
                <PencilLine className="mr-2 h-4 w-4" />
                Edit
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="split">
                <Columns className="mr-2 h-4 w-4" />
                Split
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            onClick={publishToWalrus}
            className="gap-2"
            disabled={publishing}
          >
            <CloudUpload className="h-4 w-4" />
            {publishing ? "Publishing…" : "Publish to Walrus"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={newDocument}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                New
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportMarkdown(state)}>
                <Download className="mr-2 h-4 w-4" />
                Export .md
              </DropdownMenuItem>
              <DropdownMenuItem onClick={importFromFile}>
                <Upload className="mr-2 h-4 w-4" />
                Import .md
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleImagePick} variant="outline" className="gap-2">
            <ImagePlus className="h-4 w-4" />
            Image
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,text/markdown"
            className="hidden"
            onChange={onImportChange}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onImageInputChange}
          />
        </div>
      </div>

      <div className={`grid h-[calc(100vh-4rem)] grid-cols-1 ${gridCols}`}>
        {(view === "edit" || view === "split") && (
          <div
            className={`flex flex-col overflow-hidden ${maybeBorderR} ${centerIfSolo}`}
          >
            <div
              className={`w-full ${
                view !== "split" ? "max-w-4xl mx-auto" : ""
              } flex-1 min-h-0 flex flex-col`}
            >
              <Separator />
              <Card className="m-4 flex-1 min-h-0 overflow-hidden shadow-sm">
                <CardContent className="h-full p-0 flex">
                  <Textarea
                    ref={editorRef}
                    value={state.markdown}
                    onChange={(e) =>
                      setNow((s) => ({ ...s, markdown: e.target.value }))
                    }
                    onPaste={onPaste}
                    placeholder="Write your content…"
                    className="h-full flex-1 resize-none rounded-none border-0 p-6 md:p-7 lg:p-8 font-mono text-sm leading-8 md:leading-9 tracking-[0.005em] focus-visible:ring-0 overflow-auto"
                  />
                </CardContent>
              </Card>
              <div className="flex items-center justify-between gap-3 px-5 pb-4 text-xs text-muted-foreground">
                <div className="flex gap-4">
                  <span>Words: {stats.words}</span>
                  <span>Chars: {stats.chars}</span>
                  <span>Read: {stats.readMins}m</span>
                </div>
                <span>
                  Updated: {new Date(state.updatedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {(view === "preview" || view === "split") && (
          <div className={`flex flex-col overflow-hidden ${centerIfSolo}`}>
            <ScrollArea className="flex-1">
              <div
                className={`p-4 md:p-6 lg:p-8 ${
                  view !== "split" ? "max-w-4xl mx-auto" : ""
                }`}
              >
                <Card className="h-auto border-muted/60 shadow-sm">
                  <CardContent className="p-0">
                    <div className="p-6 md:p-8 lg:p-10">
                      <article
                        className="
    prose prose-lg max-w-none dark:prose-invert prose-pre:m-0 prose-pre:p-0
    prose-p:leading-8 md:prose-p:leading-9
    prose-li:leading-8 md:prose-li:leading-9
    prose-p:my-5 md:prose-p:my-6
    prose-ul:my-5 md:prose-ul:my-6
    prose-ol:my-5 md:prose-ol:my-6
    prose-blockquote:my-6 md:prose-blockquote:my-8
    prose-img:my-8
    prose-h1:mt-0 prose-h1:mb-5 md:prose-h1:mb-6
    prose-h2:mt-10 prose-h2:mb-4 md:prose-h2:mt-12 md:prose-h2:mb-5
    prose-h3:mt-8 prose-h3:mb-3
  "
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          urlTransform={urlTransform}
                          components={{
                            img(props) {
                              return (
                                <img
                                  {...props}
                                  alt={props.alt ?? "image"}
                                  className="mx-auto my-8 max-h-[65vh] w-auto rounded-lg"
                                />
                              );
                            },
                            code({ inline, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(
                                className ?? ""
                              );
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
                          {state.markdown}
                        </ReactMarkdown>
                      </article>
                    </div>
                  </CardContent>
                </Card>

                {Object.keys(state.assets).length > 0 && (
                  <div className="mt-4 rounded-lg border border-muted/60 bg-background/40 p-4 md:p-5">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      Assets
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {Object.values(state.assets).map((a) => (
                        <figure key={a.id} className="relative">
                          <img
                            src={a.url}
                            alt={a.name}
                            className="h-24 w-24 rounded object-cover ring-1 ring-border"
                          />
                          <figcaption className="absolute inset-x-0 bottom-0 bg-black/45 p-1 text-center text-[10px] text-white">
                            asset:{a.id}
                          </figcaption>
                          <div className="absolute right-1 top-1 flex gap-1">
                            <CopyAsset id={a.id} />
                            <Button
                              size="icon"
                              variant="secondary"
                              onClick={() => removeAsset(a.id)}
                              aria-label={`Remove ${a.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}

function materializeAssets(markdown: string, assets: Record<string, Asset>) {
  return markdown.replace(
    /\(asset:([a-z0-9]+)\)/gi,
    (_, id: string) => `(${assets[id]?.url ?? `asset:${id}`})`
  );
}

function CopyAsset({ id }: { id: string }) {
  const [ok, setOk] = React.useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(`asset:${id}`);
    setOk(true);
    setTimeout(() => setOk(false), 900);
  };
  return (
    <Button
      size="icon"
      variant="secondary"
      onClick={onCopy}
      aria-label="Copy asset token"
    >
      {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string | null }) {
  const [copied, setCopied] = React.useState(false);
  let html = "";
  try {
    html = lang
      ? hljs.highlight(code, { language: lang }).value
      : hljs.highlightAuto(code).value;
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
      <pre className="m-0 max-h-[65vh] overflow-auto p-3 md:p-4 text-sm hljs bg-neutral-900 text-neutral-100 dark:bg-neutral-900 dark:text-neutral-100 rounded-b-lg">
        <code
          className={lang ? `language-${lang}` : undefined}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getStats(md: string) {
  const words = (md.match(/\b\w+\b/g) || []).length;
  const chars = md.length;
  const readMins = Math.max(1, Math.round(words / 250));
  return { words, chars, readMins };
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read fail"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}

function genId(len = 6) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += alphabet[(Math.random() * alphabet.length) | 0];
  return out;
}

function loadFromLS(): DocState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as DocState;
  } catch {}
  return {
    title: "Untitled",
    slug: slugify("untitled"),
    markdown: starterMd,
    assets: {},
    updatedAt: Date.now(),
  };
}

function exportMarkdown(s: DocState) {
  const fm = `---\ntitle: ${s.title}\nslug: ${s.slug}\n---\n\n`;
  const blob = new Blob([fm + s.markdown], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${s.slug || "document"}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseFrontmatter(text: string): {
  meta: Partial<DocState>;
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

export const starterMd = String.raw`# 🍣 Kimchi CMS — SocialFi Publishing on Sui × Walrus × Wormhole

> Create, gate, tip, and bridge — all in one place.  
> Draft here, paste screenshots, drag images in, and flip views with the tabs above.  
> **Assets** insert as \`asset:ID\` placeholders (clean editor, zero inline blobs).

---

## ✨ What you can do here

- **Compose rich posts** in Markdown (with tables, code, diagrams).
- **Attach media** with \`asset:ID\` placeholders (Walrus-backed, immutable).
- **Token-gate** sections or entire posts via **Seal** access rules.
- **Accept tips** (SUI) or **sell access** in tiers.
- **Top-up storage cross-chain**: pay on EVM/SVM → bridge via **Wormhole NTT** → spend on Sui → buy Walrus storage.
- **Export/Import** Markdown with minimal front-matter for portability.

---

## 🧭 Quick Start

1. **Write** your post below.  
2. **Attach** images/files: drag & drop → gets saved as \`asset:...\`.  
3. **Gate** content: wrap with the \`:::gate\` directive (see below).  
4. **Publish**: click **Publish** → on-chain receipt on Sui, content on Walrus.  
5. **Share** the public URL; tips and purchases flow to your wallet.

---

## 🧩 Feature Highlights

- **Clean Markdown**: No vendor lock; assets referenced by ID, not inline base64.
- **Granular gating**: Gate a paragraph, a file, or the whole doc; tiered access.
- **Cross-chain pay**: Users fund storage using stablecoins on their home chain.
- **Programmable tips**: Suggested amounts, custom splits, on-chain receipts.
- **Versioning**: Immutable content on Walrus; human-readable changelog in doc.

---

## 🏗️ Architecture (at a glance)

\`\`\`mermaid
flowchart LR
  A[User Wallet - EVM/SVM] -- pay stablecoin --> B[Kimchi Publisher (EVM)]
  B -- NTT mint & bridge --> C[Wormhole]
  C -- burn & release --> D[Sui Receiver]
  D -- swap --> E[Walrus Token]
  E -- purchase --> F[Walrus Storage Quota]
  G[Author Markdown & Assets] -- upload refs --> F
  H[Seal Rules on Sui] -- gate checks --> I[Reader Access]
  I -- tip/purchase (SUI) --> D
\`\`\`

---

## 🔌 Integrations & Addresses

**Wormhole NTT (bridge & burn)**  
- NTT Token — *Ethereum Sepolia*: \`0xd8A615aE2Ba333174ef4A06D3ae7A1E0bd24473D\`  
- NTT Token — *Sui Testnet*: \`0x3eb935f1ec4f0b4ab6001f90dc34599be58304d22414f5e4315fc61d0a471c16\`

**Walrus**  
- All initial content (Markdown, JSON, images) is stored on Walrus.

**Seal (Access Control)**  
- On-chain rules define who can read gated sections (ownership, payments, roles).

**Sui**  
- Handles Walrus storage payments, access purchases, and tips.

---

## 🧱 Content Model

Use minimal front-matter to describe what you’re publishing:

\`\`\`yaml
---
title: "Kimchi CMS: Hello World"
slug: kimchi-hello-world
summary: "A quick tour of SocialFi publishing with cross-chain storage top-ups."
cover_asset: asset:cover_v1_8392   # points to Walrus asset
tags: [socialfi, sui, walrus, wormhole, ntt]
visibility: public                  # public | gated | mixed
tiers:
  - id: supporters
    price_sui: "1.5"
    perks: ["Early access", "HD assets", "Comment priority"]
  - id: pro
    price_sui: "7.0"
    perks: ["Everything in supporters", "Source files", "Private Q&A"]
version: 1
---
\`\`\`

### Embedding Assets

- Image inline: \`![diagram](asset:walrus_diag_001)\`  
- File link: \`[download the dataset](asset:rice_mrv.json)\`  
- Video poster: \`![teaser](asset:teaser_frame)\`

> **Tip:** Drag any file — it becomes \`asset:...\`. Keep Markdown lean; the pipeline resolves IDs at publish time.

---

## 🔐 Gating Content with Seal

Wrap gated blocks with a directive. Kimchi resolves & enforces via Seal on read.

\`\`\`
:::gate tier=supporters
This section is for **Supporters** and above.
- HD diagrams: ![HD](asset:hd_flow_01)
- Bonus notes: \`asset:bonus_notes.md\`
:::
\`\`\`

You can also gate by **NFT ownership**, **role**, or **custom rule**:

\`\`\`
:::gate rule="has_nft:0xNFTCOLLECT-ABC on Sui Testnet"
Collectors get this behind-the-scenes section.
:::
\`\`\`

---

## 🌉 Cross-Chain Storage Top-Up (for readers & authors)

1. Pick **“Top-Up Storage”**.
2. Choose **chain** (e.g., Sepolia) & **token** (mock stablecoin in POC).
3. Approve & pay → **Wormhole NTT** mints and bridges.
4. On **Sui**, NTT burns/releases; funds swap to **Walrus token**.
5. Kimchi purchases **Walrus storage quota** for your account.

> You never need to hold Walrus token or touch Sui directly.

---

## 🧪 Example: Code Block & Syntax Highlight

\`\`\`ts
export function hello(name: string) {
  return \`Hello, \${name}!\`;
}

type PostMeta = {
  id: string;
  title: string;
  cover?: string;   // asset:ID
  gated?: boolean;
  tiers?: string[];
};
\`\`\`

---

## 🗂️ Example: Tables

| Tier        | Price (SUI) | Perks                                   |
|-------------|-------------:|-----------------------------------------|
| Free        | 0            | Public intro, low-res images            |
| Supporters  | 1.5          | HD assets, early access                 |
| Pro         | 7.0          | Source files, datasets, private Q&A     |

---

## 🧰 Author Toolkit

- **Shortcodes**  
  - \`{{now}}\` → current timestamp  
  - \`{{author.name}}\` → your display name  
  - \`{{post.slug}}\` → slug from front-matter

- **Callouts**  
  > [!NOTE] Content stored on Walrus is immutable; publish wisely.  
  > [!TIP] Use \`asset:\` placeholders to keep Markdown portable.

---

## 🚦 Draft → Review → Publish

1. **Draft**: Save locally (auto-save on).  
2. **Preview**: Check gating & asset resolution.  
3. **Review**: Optional co-signer or multi-sig workflow (coming soon).  
4. **Publish**: Writes a receipt to Sui; uploads assets to Walrus.  
5. **Pin**: Feature on your profile; share the link.

---

## 🔐 Security & Receipts

- **Content proofs**: Walrus hashes per asset.  
- **Access receipts**: Sui tx references for every purchase & tip.  
- **Bridging**: Wormhole NTT bridge-and-burn flow; auditable endpoints.

---

## 🗺️ Roadmap (public)

- [ ] Comments & reactions on-chain (lightweight)  
- [ ] Multi-author splits for tips & sales  
- [ ] NFT drops tied to gated posts  
- [ ] Analytics (privacy-preserving)  
- [ ] Mobile-first composer UX  
- [ ] ProseMirror block plugins for \`gate\`, \`tipbox\`, \`purchase\`

---

## 🧪 Test Assets (replace with yours)

- Cover: \`asset:cover_v1_8392\`  
- Diagram: \`asset:walrus_flow_02\`  
- Dataset: \`asset:kimchi_demo_set\`

---

## 📎 Appendices

### A. Minimal Post Template

\`\`\`markdown
---
title: "My First Kimchi Post"
slug: my-first-kimchi-post
visibility: mixed
cover_asset: asset:cover_demo
tags: [intro, tutorial]
---

Welcome to **Kimchi**! Here’s a public intro.

:::gate tier=supporters
Thanks, supporters! Enjoy the HD cover:
![HD Cover](asset:cover_hd_demo)
:::

:::tipbox
suggested: [1]
message: "Send a small tip if this saved you time 🙌"
recipient: "0xYOUR_SUI_ADDRESS"
:::
\`\`\`

### B. Environment Cheat-Sheet (for devs)

- \`NTT_TOKEN_ETHEREUM_SEPOLIA=0xd8A6...473D\`  
- \`NTT_TOKEN_SUI_TESTNET=0x3eb9...c16\`  
- \`WALRUS_ENDPOINT=https://...\`  
- \`SUI_RPC=https://...\`

---

## 🤝 Credits

Kimchi CMS is built on:
- **Sui** for payments & receipts  
- **Walrus** for durable content storage  
- **Seal** for access control  
- **Wormhole NTT** for cross-chain top-ups

Ready? **Start writing** below and drag your first image now → it’ll show up as \`asset:your_first_id\`.
`;
