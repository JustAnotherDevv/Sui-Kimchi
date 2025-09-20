import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, ImagePlus, Trash2, Download, Upload, FilePlus2, MoreHorizontal, Eye, PencilLine, Columns, Hash, CloudUpload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";
import { WalrusClient } from "@mysten/walrus";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import WALRUS_WASM_URL from "@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url";

const WALRUS_NETWORK: "testnet" | "mainnet" | "localnet" = (import.meta.env.VITE_WALRUS_NETWORK as any) ?? "testnet";
const SUI_RPC_URL = import.meta.env.VITE_SUI_RPC_URL ?? getFullnodeUrl(WALRUS_NETWORK);
const UPLOAD_RELAY_HOST = import.meta.env.VITE_WALRUS_UPLOAD_RELAY ?? "https://upload-relay.testnet.walrus.space";
const TIP_MAX: number = Number(import.meta.env.VITE_WALRUS_TIP_MAX ?? 1000000);

type Asset = { id: string; name: string; url: string };
type DocState = { title: string; slug: string; markdown: string; assets: Record<string, Asset>; updatedAt: number };
const LS_KEY = "procms:doc";

export default function ProCMS() {
  const [state, setState] = React.useState<DocState>(() => loadFromLS());
  const [saveState, setSaveState] = React.useState<"saved" | "saving" | "dirty">("saved");
  const [view, setView] = React.useState<"edit" | "preview" | "split">("split");
  const [publishing, setPublishing] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const editorRef = React.useRef<HTMLTextAreaElement>(null);

  const signer = React.useMemo(() => {
    const b64 = import.meta.env.VITE_SUI_PRIVATE_KEY_BASE64 as string | undefined;
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

  const onImageInputChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    if (f) await handleImageFile(f);
    e.currentTarget.value = "";
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) await handleImageFile(f);
  };

  const onPaste: React.ClipboardEventHandler<HTMLTextAreaElement> = async (e) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) {
      const f = item.getAsFile();
      if (f) await handleImageFile(f);
      e.preventDefault();
    }
  };

  const removeAsset = (id: string) => {
    setNow((s) => {
      const { [id]: _, ...rest } = s.assets;
      return { ...s, assets: rest, markdown: s.markdown.replaceAll(`(asset:${id})`, "(removed-asset)") };
    });
  };

  const urlTransform = React.useCallback((v: string) => (v.startsWith("asset:") ? state.assets[v.slice(6)]?.url ?? v : v), [state.assets]);

  const stats = React.useMemo(() => getStats(state.markdown), [state.markdown]);

  const newDocument = () => {
    setNow(() => ({ title: "Untitled", slug: slugify("untitled"), markdown: starterMd, assets: {}, updatedAt: Date.now() }));
  };

  const importFromFile = () => fileInputRef.current?.click();

  const onImportChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const parsed = parseFrontmatter(text);
    setNow((s) => ({ ...s, title: parsed.meta.title ?? s.title, slug: parsed.meta.slug ?? s.slug, markdown: parsed.body }));
    e.currentTarget.value = "";
  };

  const publishToWalrus = async () => {
    if (publishing) return;
    if (!signer) {
      alert("No signer configured. Set VITE_SUI_PRIVATE_KEY_BASE64 and fund it on testnet.");
      return;
    }
    setPublishing(true);
    try {
      const materialized = materializeAssets(state.markdown, state.assets);
      const fm = `---\ntitle: ${state.title}\nslug: ${state.slug}\n---\n\n`;
      const finalMd = fm + materialized;
      const bytes = new TextEncoder().encode(finalMd);
      // @ts-ignore
      const resp = await walrus.walrus.writeBlob({ blob: bytes, deletable: false, epochs: 1, signer });
      console.log("[Walrus publish] OK:", resp);
      alert(`Published! blobId: ${resp.blobId}`);
      setSaveState("saved");
    } catch (err: any) {
      console.error("[Walrus publish] error:", err);
      const msg = String(err?.message ?? err);
      if (msg.includes("missing the transaction ID") || msg.includes("requires them to check the tip")) {
        alert("Relay requires a tip. Increase VITE_WALRUS_TIP_MAX (e.g. 5000000) and try again.");
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
    <div className="h-screen w-screen overflow-hidden bg-background" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="flex h-14 items-center gap-3 border-b px-4">
        <PencilLine className="h-5 w-5" />
        <Input value={state.title} onChange={(e) => setNow((s) => ({ ...s, title: e.target.value }))} placeholder="Title" className="max-w-sm" />
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-muted-foreground" />
          <Input value={state.slug} onChange={(e) => setNow((s) => ({ ...s, slug: slugify(e.target.value) }))} placeholder="slug" className="w-48" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={saveState === "saved" ? "secondary" : saveState === "saving" ? "outline" : "destructive"}>
                  {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Unsaved"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Autosaves to localStorage</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="hidden md:block">
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

          <Button onClick={publishToWalrus} className="gap-2" disabled={publishing}>
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
          <input ref={fileInputRef} type="file" accept=".md,.markdown,text/markdown" className="hidden" onChange={onImportChange} />
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImageInputChange} />
        </div>
      </div>

      <div className={`grid h-[calc(100vh-3.5rem)] grid-cols-1 ${gridCols}`}>
        {(view === "edit" || view === "split") && (
          <div className={`flex flex-col overflow-hidden ${maybeBorderR} ${centerIfSolo}`}>
            <div className={`w-full ${view !== "split" ? "max-w-3xl mx-auto" : ""} flex-1 min-h-0 flex flex-col`}>
              <Separator />
              <Card className="m-3 flex-1 min-h-0 overflow-hidden">
                <CardContent className="h-full p-0 flex">
                  <Textarea
                    ref={editorRef}
                    value={state.markdown}
                    onChange={(e) => setNow((s) => ({ ...s, markdown: e.target.value }))}
                    onPaste={onPaste}
                    placeholder="Write your content…"
                    className="h-full flex-1 resize-none rounded-none border-0 p-4 font-mono text-sm focus-visible:ring-0 overflow-auto"
                  />
                </CardContent>
              </Card>
              <div className="flex items-center justify-between gap-3 px-4 pb-3 text-xs text-muted-foreground">
                <div className="flex gap-3">
                  <span>Words: {stats.words}</span>
                  <span>Chars: {stats.chars}</span>
                  <span>Read: {stats.readMins}m</span>
                </div>
                <span>Updated: {new Date(state.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {(view === "preview" || view === "split") && (
          <div className={`flex flex-col overflow-hidden ${centerIfSolo}`}>
            <ScrollArea className="flex-1">
              <div className={`p-3 ${view !== "split" ? "max-w-3xl mx-auto" : ""}`}>
                <Card className="h-auto">
                  <CardContent className="p-0">
                    <div className="p-5">
                      <article className="prose max-w-none dark:prose-invert prose-pre:p-0">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          urlTransform={urlTransform}
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
                          {state.markdown}
                        </ReactMarkdown>
                      </article>
                    </div>
                  </CardContent>
                </Card>

                {Object.keys(state.assets).length > 0 && (
                  <div className="mt-3 rounded-lg border p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Assets</div>
                    <div className="flex flex-wrap gap-3">
                      {Object.values(state.assets).map((a) => (
                        <figure key={a.id} className="relative">
                          <img src={a.url} alt={a.name} className="h-20 w-20 rounded object-cover" />
                          <div className="absolute inset-x-0 bottom-0 bg-black/40 p-1 text-center text-[10px] text-white">asset:{a.id}</div>
                          <div className="absolute right-1 top-1 flex gap-1">
                            <CopyAsset id={a.id} />
                            <Button size="icon" variant="secondary" onClick={() => removeAsset(a.id)} aria-label={`Remove ${a.name}`}>
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
  return markdown.replace(/\(asset:([a-z0-9]+)\)/gi, (_, id: string) => `(${assets[id]?.url ?? `asset:${id}`})`);
}

function CopyAsset({ id }: { id: string }) {
  const [ok, setOk] = React.useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(`asset:${id}`);
    setOk(true);
    setTimeout(() => setOk(false), 900);
  };
  return (
    <Button size="icon" variant="secondary" onClick={onCopy} aria-label="Copy asset token">
      {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string | null }) {
  const [copied, setCopied] = React.useState(false);
  let html = "";
  try {
    html = lang ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value;
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
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
        <Button onClick={onCopy} size="sm" variant="ghost" className="gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="m-0 max-h-[60vh] overflow-auto p-3 text-sm hljs bg-neutral-900 text-neutral-100 dark:bg-neutral-900 dark:text-neutral-100 rounded-b-lg">
        <code className={lang ? `language-${lang}` : undefined} dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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
  for (let i = 0; i < len; i++) out += alphabet[(Math.random() * alphabet.length) | 0];
  return out;
}

function loadFromLS(): DocState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as DocState;
  } catch {}
  return { title: "Untitled", slug: slugify("untitled"), markdown: starterMd, assets: {}, updatedAt: Date.now() };
}

function exportMarkdown(s: DocState) {
  const fm = `---\ntitle: ${s.title}\nslug: ${s.slug}\n---\n\n`;
  const blob = new Blob([fm + s.markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${s.slug || "document"}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseFrontmatter(text: string): { meta: Partial<DocState>; body: string } {
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

const starterMd = `# Welcome to Kimchi CMS

Type here, paste screenshots, drag images in, and switch views with the tabs above.

- Images insert as \`asset:ID\` placeholders (clean editor)
- Export/Import Markdown with minimal frontmatter
- Code blocks:

\`\`\`ts
export function hello(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`
`;
