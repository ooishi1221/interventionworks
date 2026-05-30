"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Download, Printer, Bookmark, BookmarkCheck, Settings2, Plus,
  ChevronUp, ChevronDown, ChevronRight, X, Trash2, Sun, Moon, ListFilter,
  FileSpreadsheet, ArrowRight,
} from "lucide-react";
import { StandardTemplate, ChecklistTemplate, BusinessTemplate, type PrintFormat, type ColorScheme, COLOR_MAP, DEFAULT_COLOR } from "./PrintTemplates";
import type { ChecklistData, ChecklistItem, ColumnDef, ColumnDropdown, Status, Template } from "@/lib/types";
import { DEFAULT_COLUMNS } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";
import { exportToExcel } from "@/lib/excel";

const STATUS_OPTIONS: Status[] = ["未着手", "進行中", "保留", "完了"];

const STATUS_STYLE: Record<Status, string> = {
  未着手: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  進行中: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  保留:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  完了:   "bg-yo-light text-yo dark:bg-orange-900/40 dark:text-orange-300",
};

const STORAGE_KEY     = "yoshinoya_checklists";
const MY_TEMPLATE_KEY = "yoshinoya_my_templates";
const DARK_KEY        = "yoshinoya_dark";

function uid() { return Math.random().toString(36).slice(2, 10); }

function todayStr() {
  return new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
  }).replace(/\//g, "-");
}

function newItem(columns: ColumnDef[]): ChecklistItem {
  const customFields: Record<string, string> = {};
  columns.filter(c => !c.builtin).forEach(c => { customFields[c.id] = ""; });
  return {
    id: uid(), category: "", taskName: "", deadline: "",
    assignee: "", status: "未着手", reviewer: "",
    completedDate: "", notes: "", checked: false, customFields,
  };
}

function fromTemplate(t: Template): ChecklistData {
  return {
    id: uid(), title: t.defaultTitle,
    createdAt: todayStr(), updatedAt: todayStr(),
    author: "", manager: "",
    columns: DEFAULT_COLUMNS.map(c => ({ ...c })),
    items: t.items.map(item => ({ ...item, id: uid(), customFields: {} })),
  };
}

function fromMyTemplate(tmpl: ChecklistData): ChecklistData {
  return {
    ...tmpl, id: uid(), createdAt: todayStr(), updatedAt: todayStr(), author: "", manager: "",
    items: tmpl.items.map(item => ({ ...item, id: uid(), checked: false, status: "未着手" as Status, completedDate: "" })),
  };
}

function toMyTemplate(list: ChecklistData): ChecklistData {
  return {
    ...list,
    items: list.items.map(item => ({ ...item, checked: false, status: "未着手" as Status, completedDate: "" })),
  };
}

function loadAll(): ChecklistData[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveAll(lists: ChecklistData[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(lists)); }
function loadMyTemplates(): ChecklistData[] {
  try { return JSON.parse(localStorage.getItem(MY_TEMPLATE_KEY) || "[]"); } catch { return []; }
}
function saveMyTemplates(ts: ChecklistData[]) { localStorage.setItem(MY_TEMPLATE_KEY, JSON.stringify(ts)); }

// ─── Root ────────────────────────────────────────────────────────────────────

export default function ChecklistBuilder() {
  const [view, setView]               = useState<"home" | "builder">("home");
  const [savedLists, setSavedLists]   = useState<ChecklistData[]>([]);
  const [myTemplates, setMyTemplates] = useState<ChecklistData[]>([]);
  const [current, setCurrent]         = useState<ChecklistData | null>(null);
  const [isSaved, setIsSaved]         = useState(false);
  const [tmplSaved, setTmplSaved]     = useState(false);
  const [dark, setDark]               = useState(false);

  useEffect(() => {
    setSavedLists(loadAll());
    setMyTemplates(loadMyTemplates());
    const stored = localStorage.getItem(DARK_KEY);
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored !== null ? stored === "true" : sys;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(DARK_KEY, String(next));
  };

  const openTemplate   = (t: Template) => { setCurrent(fromTemplate(t)); setIsSaved(false); setTmplSaved(false); setView("builder"); };
  const openMyTemplate = (t: ChecklistData) => { setCurrent(fromMyTemplate(t)); setIsSaved(false); setTmplSaved(false); setView("builder"); };
  const openSaved      = (l: ChecklistData) => {
    const m = l.columns ? l : { ...l, columns: DEFAULT_COLUMNS.map(c => ({ ...c })) };
    setCurrent(m); setIsSaved(true); setTmplSaved(false); setView("builder");
  };

  const handleSave = useCallback((list: ChecklistData) => {
    const updated = { ...list, updatedAt: todayStr() };
    setSavedLists(prev => {
      const next = prev.some(l => l.id === updated.id)
        ? prev.map(l => l.id === updated.id ? updated : l)
        : [...prev, updated];
      saveAll(next); return next;
    });
    setCurrent(updated); setIsSaved(true);
  }, []);

  const handleSaveAsTemplate = useCallback((list: ChecklistData) => {
    const tmpl = toMyTemplate(list);
    setMyTemplates(prev => {
      const next = prev.some(t => t.id === tmpl.id) ? prev.map(t => t.id === tmpl.id ? tmpl : t) : [...prev, tmpl];
      saveMyTemplates(next); return next;
    });
    setTmplSaved(true);
    setTimeout(() => setTmplSaved(false), 2000);
  }, []);

  const deleteSaved = (id: string) => {
    if (!confirm("このリストを削除しますか？")) return;
    setSavedLists(prev => { const next = prev.filter(l => l.id !== id); saveAll(next); return next; });
  };
  const deleteMyTemplate = (id: string) => {
    if (!confirm("このマイテンプレートを削除しますか？")) return;
    setMyTemplates(prev => { const next = prev.filter(t => t.id !== id); saveMyTemplates(next); return next; });
  };

  if (view === "builder" && current) {
    return (
      <Builder
        data={current} isSaved={isSaved} tmplSaved={tmplSaved} dark={dark}
        onChange={d => { setCurrent(d); setIsSaved(false); }}
        onSave={handleSave} onSaveAsTemplate={handleSaveAsTemplate}
        onToggleDark={toggleDark} onBack={() => setView("home")}
      />
    );
  }

  return (
    <Home
      templates={TEMPLATES} savedLists={savedLists} myTemplates={myTemplates} dark={dark}
      onSelectTemplate={openTemplate} onOpenMyTemplate={openMyTemplate} onOpenSaved={openSaved}
      onDeleteSaved={deleteSaved} onDeleteMyTemplate={deleteMyTemplate} onToggleDark={toggleDark}
    />
  );
}

// ─── Dark toggle ──────────────────────────────────────────────────────────────

function DarkToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      title={dark ? "ライトモードへ" : "ダークモードへ"}>
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────

function Home({
  templates, savedLists, myTemplates, dark,
  onSelectTemplate, onOpenMyTemplate, onOpenSaved, onDeleteSaved, onDeleteMyTemplate, onToggleDark,
}: {
  templates: Template[]; savedLists: ChecklistData[]; myTemplates: ChecklistData[]; dark: boolean;
  onSelectTemplate: (t: Template) => void; onOpenMyTemplate: (t: ChecklistData) => void;
  onOpenSaved: (l: ChecklistData) => void; onDeleteSaved: (id: string) => void;
  onDeleteMyTemplate: (id: string) => void; onToggleDark: () => void;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 font-sans transition-colors">

      {/* ─ ナビ ─ */}
      <header className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4 text-white dark:text-gray-900" />
            </div>
            <span className="font-bold text-gray-900 dark:text-gray-50 tracking-tight text-sm">Checklist Builder</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectTemplate(templates.find(t => t.id === "blank")!)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-xs font-semibold hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              新規作成
            </button>
            <DarkToggle dark={dark} onToggle={onToggleDark} />
          </div>
        </div>
      </header>

      {/* ─ ヒーロー ─ */}
      <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-5xl mx-auto px-6 py-14">
          <p className="text-xs font-bold tracking-[0.2em] text-gray-600 dark:text-gray-400 uppercase mb-4">Checklist Builder</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white leading-[1.15] tracking-tight mb-4">
            チェックリストを<span className="text-gray-300 dark:text-gray-600">きれいに。</span>
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-8">Web上で入力 → Excel・PDF にすっきり出力</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSelectTemplate(templates.find(t => t.id === "blank")!)}
              className="flex items-center gap-2 px-5 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors shadow-sm">
              <Plus className="w-4 h-4" />
              新規作成
            </button>
            <span className="text-xs text-gray-300 dark:text-gray-700">または下のテンプレートから選ぶ</span>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-14">

        {/* ─ マイテンプレート ─ */}
        {myTemplates.length > 0 && (
          <section>
            <SectionLabel label="マイテンプレート" count={myTemplates.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
              {myTemplates.map(tmpl => (
                <div key={tmpl.id} className="group relative">
                  <button onClick={() => onOpenMyTemplate(tmpl)}
                    className="w-full text-left bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-900 dark:bg-white opacity-0 group-hover:opacity-100 transition-opacity rounded-l-2xl" />
                    <Bookmark className="w-4 h-4 text-gray-300 dark:text-gray-600 mb-4" />
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug">{tmpl.title}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">{tmpl.items.length} 項目</div>
                  </button>
                  <button onClick={() => onDeleteMyTemplate(tmpl.id)}
                    className="absolute top-3 right-3 text-gray-200 dark:text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─ テンプレート ─ */}
        <section>
          <SectionLabel label="テンプレートから作成" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
            {templates.filter(t => t.id !== "blank").map((t, i) => (
              <button key={t.id} onClick={() => onSelectTemplate(t)}
                className="group text-left bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg hover:-translate-y-1 transition-all relative overflow-hidden">
                {/* ホバー時のアクセントバー */}
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-900 dark:bg-white opacity-0 group-hover:opacity-100 transition-opacity rounded-l-2xl" />
                {/* 薄い番号 */}
                <span className="absolute top-5 right-6 text-4xl font-bold text-gray-50 dark:text-gray-800 select-none tabular-nums leading-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="text-2xl mb-4 relative">{t.emoji}</div>
                <div className="font-bold text-gray-900 dark:text-gray-100 text-base group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors relative">{t.name}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 leading-relaxed relative">{t.description}</div>
                <div className="flex items-center gap-1 mt-4 text-xs text-gray-300 dark:text-gray-700 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors relative">
                  <span>作成する</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ─ 保存済みリスト ─ */}
        {savedLists.length > 0 && (
          <section>
            <SectionLabel label="保存済みリスト" count={savedLists.length} />
            <div className="space-y-2 mt-5">
              {savedLists.map(list => {
                const done  = list.items.filter(i => i.checked || i.status === "完了").length;
                const total = list.items.length;
                const rate  = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <div key={list.id} className="group flex items-center gap-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-sm transition-all">
                    <button onClick={() => onOpenSaved(list)} className="flex-1 text-left min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">{list.title}</div>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1 max-w-48">
                          <div className="bg-gray-400 dark:bg-gray-500 h-1 rounded-full transition-all" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400 shrink-0 tabular-nums">{rate}% · {list.updatedAt}</span>
                      </div>
                    </button>
                    <button onClick={() => onDeleteSaved(list.id)}
                      className="text-gray-200 dark:text-gray-700 hover:text-red-400 transition-all p-1 shrink-0 opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}

function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-[0.15em] shrink-0">{label}</h2>
      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
      {count !== undefined && (
        <span className="text-xs text-gray-300 dark:text-gray-600 tabular-nums shrink-0">{count}</span>
      )}
    </div>
  );
}

// ─── Column Settings ──────────────────────────────────────────────────────────

function ColumnSettings({
  columns, onToggle, onAddCustom, onRemoveCustom, onRenameCustom, onUpdateDropdown, onClose,
}: {
  columns: ColumnDef[];
  onToggle: (id: string) => void;
  onAddCustom: (label: string) => void;
  onRemoveCustom: (id: string) => void;
  onRenameCustom: (id: string, label: string) => void;
  onUpdateDropdown: (id: string, dd: ColumnDropdown | undefined) => void;
  onClose: () => void;
}) {
  const [newColName, setNewColName] = useState("");
  const [newChoices, setNewChoices] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const label = newColName.trim();
    if (!label) return;
    onAddCustom(label);
    setNewColName("");
    inputRef.current?.focus();
  };

  const addChoice = (col: ColumnDef) => {
    const c = (newChoices[col.id] ?? "").trim();
    if (!c) return;
    const dd = col.dropdown ?? { enabled: true, choices: [] };
    onUpdateDropdown(col.id, { ...dd, choices: [...dd.choices.filter(x => x !== c), c] });
    setNewChoices(prev => ({ ...prev, [col.id]: "" }));
  };

  const removeChoice = (col: ColumnDef, choice: string) => {
    const dd = col.dropdown;
    if (!dd) return;
    onUpdateDropdown(col.id, { ...dd, choices: dd.choices.filter(x => x !== choice) });
  };

  return (
    <div className="absolute right-0 top-10 z-30 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">列の設定</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {columns.map(col => {
          const isStatus = col.builtin === "status";
          const dd       = col.dropdown;

          return (
            <div key={col.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
              {/* 列の行 */}
              <div className="flex items-center gap-2 px-4 py-2.5">
                <input type="checkbox" checked={col.visible} onChange={() => onToggle(col.id)}
                  className="w-4 h-4 rounded accent-yo shrink-0" />
                {col.builtin ? (
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{col.label}</span>
                ) : (
                  <input value={col.label} onChange={e => onRenameCustom(col.id, e.target.value)}
                    className="flex-1 text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 outline-none focus:border-yo text-gray-800 dark:text-gray-200" />
                )}
                {!col.builtin && (
                  <button onClick={() => onRemoveCustom(col.id)} className="text-gray-300 dark:text-gray-600 hover:text-red-400 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* ドロップダウン設定（全列共通・常時展開） */}
              <div className="px-4 pb-3 bg-gray-50/40 dark:bg-gray-800/20">
                <div className="flex items-center gap-2 py-1.5">
                  <ListFilter className="w-3 h-3 text-gray-600 dark:text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">選択肢（ドロップダウン）</span>
                  {isStatus ? (
                    <span className="text-xs text-yo font-medium">常時ON</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUpdateDropdown(col.id, dd ? { ...dd, enabled: !dd.enabled } : { enabled: true, choices: [] })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${dd?.enabled ? "bg-yo" : "bg-gray-200 dark:bg-gray-700"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${dd?.enabled ? "translate-x-4" : "translate-x-1"}`} />
                    </button>
                  )}
                </div>

                {(isStatus || dd?.enabled) && (
                  <div className="mt-1.5">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(dd?.choices ?? []).map(choice => (
                        <span key={choice} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">
                          {choice}
                          <button type="button" onClick={() => removeChoice(col, choice)} className="text-gray-300 hover:text-red-400">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {(dd?.choices ?? []).length === 0 && (
                        <span className="text-xs text-gray-600 dark:text-gray-500">↓ 選択肢を追加</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={newChoices[col.id] ?? ""}
                        onChange={e => setNewChoices(prev => ({ ...prev, [col.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && addChoice(col)}
                        placeholder="入力 → Enter"
                        className="flex-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-yo text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600"
                      />
                      <button type="button" onClick={() => addChoice(col)} disabled={!(newChoices[col.id] ?? "").trim()}
                        className="px-2.5 py-1.5 text-xs bg-yo text-white rounded-lg hover:bg-yo-dark disabled:opacity-40 transition-colors shrink-0">
                        追加
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* カスタム列追加 */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/30">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">列を追加</p>
          <div className="flex gap-2">
            <input ref={inputRef} value={newColName} onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="列名を入力"
              className="flex-1 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 outline-none focus:border-yo text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600" />
            <button type="button" onClick={handleAdd} disabled={!newColName.trim()}
              className="px-3 py-1.5 text-sm bg-yo text-white rounded-lg hover:bg-yo-dark disabled:opacity-40 transition-colors">
              追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Builder ─────────────────────────────────────────────────────────────────

function Builder({
  data, isSaved, tmplSaved, dark, onChange, onSave, onSaveAsTemplate, onToggleDark, onBack,
}: {
  data: ChecklistData; isSaved: boolean; tmplSaved: boolean; dark: boolean;
  onChange: (d: ChecklistData) => void; onSave: (d: ChecklistData) => void;
  onSaveAsTemplate: (d: ChecklistData) => void; onToggleDark: () => void; onBack: () => void;
}) {
  const [showColSettings, setShowColSettings]   = useState(false);
  const [showPrintModal, setShowPrintModal]     = useState(false);
  const [showExcelModal, setShowExcelModal]     = useState(false);
  const [printFormat, setPrintFormat]           = useState<PrintFormat | null>(null);
  const [previewFormat, setPreviewFormat]       = useState<PrintFormat | null>(null);
  const [colorScheme, setColorScheme]           = useState<ColorScheme>(DEFAULT_COLOR);
  const visibleCols    = data.columns.filter(c => c.visible);
  const completedCount = data.items.filter(i => i.checked || i.status === "完了").length;
  const total          = data.items.length;
  const rate           = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const updateHeader = (key: keyof Omit<ChecklistData, "items" | "id" | "columns">, value: string) =>
    onChange({ ...data, [key]: value });

  const updateItem = (id: string, key: keyof ChecklistItem, value: string | boolean) =>
    onChange({ ...data, items: data.items.map(item => item.id === id ? { ...item, [key]: value } : item) });

  const updateCustomField = (itemId: string, colId: string, value: string) =>
    onChange({
      ...data,
      items: data.items.map(item =>
        item.id === itemId ? { ...item, customFields: { ...item.customFields, [colId]: value } } : item
      ),
    });

  const addItem    = () => onChange({ ...data, items: [...data.items, newItem(data.columns)] });
  const removeItem = (id: string) => onChange({ ...data, items: data.items.filter(i => i.id !== id) });

  const moveItem = (index: number, dir: -1 | 1) => {
    const next = [...data.items];
    const t = index + dir;
    if (t < 0 || t >= next.length) return;
    [next[index], next[t]] = [next[t], next[index]];
    onChange({ ...data, items: next });
  };

  const updateColumns = (cols: ColumnDef[]) => onChange({ ...data, columns: cols });
  const toggleColumn  = (id: string) => updateColumns(data.columns.map(c => c.id === id ? { ...c, visible: !c.visible } : c));

  const addCustomColumn = (label: string) => {
    const id = uid();
    onChange({
      ...data,
      columns: [...data.columns, { id, label, visible: true }],
      items: data.items.map(item => ({ ...item, customFields: { ...item.customFields, [id]: "" } })),
    });
  };

  const removeCustomColumn = (colId: string) =>
    onChange({
      ...data,
      columns: data.columns.filter(c => c.id !== colId),
      items: data.items.map(item => { const cf = { ...item.customFields }; delete cf[colId]; return { ...item, customFields: cf }; }),
    });

  const renameCustomColumn = (colId: string, label: string) =>
    updateColumns(data.columns.map(c => c.id === colId ? { ...c, label } : c));

  const updateDropdown = (colId: string, dd: ColumnDropdown | undefined) =>
    updateColumns(data.columns.map(c => c.id === colId ? { ...c, dropdown: dd } : c));

  const handlePrint = (fmt: PrintFormat) => {
    setPrintFormat(fmt);
    setShowPrintModal(false);
    setTimeout(() => {
      const prev = document.title;
      document.title = data.title;
      window.print();
      document.title = prev;
    }, 80);
  };

  const inputBase = "w-full text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:border-yo text-gray-800 dark:text-gray-200";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans transition-colors">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={onBack} className="text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-gray-200 dark:text-gray-700">|</span>
        <input value={data.title} onChange={e => updateHeader("title", e.target.value)}
          className="flex-1 text-lg font-bold text-gray-900 dark:text-gray-50 bg-transparent border-none outline-none min-w-0"
          placeholder="タイトルを入力" />
        <div className="flex items-center gap-1.5 shrink-0">
          <DarkToggle dark={dark} onToggle={onToggleDark} />
          {/* スマホでは非表示 */}
          <button
            onClick={() => { if (confirm("全項目をクリアします。よろしいですか？")) { onChange({ ...data, items: [newItem(data.columns), newItem(data.columns), newItem(data.columns)] }); } }}
            className="hidden sm:block text-gray-600 dark:text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            title="全クリア">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => onSaveAsTemplate(data)}
            title="このリストの構造を雛形として保存（入力内容はリセット）"
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tmplSaved ? "bg-yo-light text-yo dark:bg-orange-900/40 dark:text-orange-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}>
            {tmplSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            <span className="hidden md:inline">{tmplSaved ? "雛形に保存した" : "雛形として保存"}</span>
          </button>
          <button onClick={() => onSave(data)}
            title="このブラウザに一時保存（別PCでは引き継げません）"
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isSaved ? "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" : "text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}>
            <span className="hidden md:inline">{isSaved ? "保存済み（ブラウザ）" : "ブラウザに保存"}</span>
            <span className="md:hidden">{isSaved ? "保存済" : "保存"}</span>
          </button>
          <div className="relative">
            <button onClick={() => setShowExcelModal(v => !v)}
              className={`px-3 sm:px-5 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-1.5 shadow-sm ${
                showExcelModal ? "bg-emerald-700 text-white" : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Excel 出力</span>
            </button>
            {showExcelModal && (
              <FormatModal mode="excel" onSelect={fmt => { setShowExcelModal(false); setPreviewFormat(fmt); }} onClose={() => setShowExcelModal(false)} />
            )}
          </div>
          <div className="relative">
            <button onClick={() => setShowPrintModal(v => !v)}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                showPrintModal ? "bg-yo text-white" : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}>
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">印刷 / PDF</span>
            </button>
            {showPrintModal && (
              <FormatModal mode="print" onSelect={handlePrint} onClose={() => setShowPrintModal(false)} />
            )}
          </div>
        </div>
      </header>

      <main className="max-w-full px-4 py-6 space-y-4">
        <div className="max-w-5xl mx-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <Field label="作成日"><input type="date" value={data.createdAt} onChange={e => updateHeader("createdAt", e.target.value)} className={inputBase} /></Field>
            <Field label="更新日"><input type="date" value={data.updatedAt} onChange={e => updateHeader("updatedAt", e.target.value)} className={inputBase} /></Field>
            <Field label="作成者"><input value={data.author} onChange={e => updateHeader("author", e.target.value)} placeholder="氏名" className={inputBase} /></Field>
            <Field label="管理者"><input value={data.manager} onChange={e => updateHeader("manager", e.target.value)} placeholder="氏名" className={inputBase} /></Field>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-600 dark:text-gray-400 font-medium">進捗率</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{rate}%（{completedCount} / {total} 件）</span>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-full h-2.5">
              <div className="bg-yo h-2.5 rounded-full transition-all duration-500" style={{ width: `${rate}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm text-gray-600 dark:text-gray-400">{total} 件</span>
            <div className="relative">
              <button onClick={() => setShowColSettings(v => !v)}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  showColSettings
                    ? "bg-yo-light text-yo dark:bg-orange-900/40 dark:text-orange-300"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}>
                <Settings2 className="w-4 h-4" />
                列設定
              </button>
              {showColSettings && (
                <ColumnSettings
                  columns={data.columns}
                  onToggle={toggleColumn}
                  onAddCustom={addCustomColumn}
                  onRemoveCustom={removeCustomColumn}
                  onRenameCustom={renameCustomColumn}
                  onUpdateDropdown={updateDropdown}
                  onClose={() => setShowColSettings(false)}
                />
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-b-xl" style={{overflowY: "visible"}}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                  <th className="w-8 px-3 py-3 text-center text-gray-600 dark:text-gray-400 font-medium">✓</th>
                  <th className="w-10 px-2 py-3 text-center text-gray-600 dark:text-gray-400 font-medium text-sm">No.</th>
                  {visibleCols.map(col => (
                    <th key={col.id} className="px-3 py-3 text-left text-gray-600 dark:text-gray-400 font-medium text-sm whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        {col.label}
                        {(col.dropdown?.enabled || col.builtin === "status") && (
                          <ListFilter className="w-3 h-3 text-yo opacity-70" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="w-16 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => {
                  const done = item.checked || item.status === "完了";
                  return (
                    <tr key={item.id}
                      className={`border-b border-gray-100 dark:border-gray-800 transition-colors ${
                        done ? "bg-orange-50/60 dark:bg-orange-950/20" : "hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                      }`}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={item.checked}
                          onChange={e => updateItem(item.id, "checked", e.target.checked)}
                          className="w-4 h-4 rounded accent-yo cursor-pointer" />
                      </td>
                      <td className="px-2 py-2 text-center text-gray-600 dark:text-gray-500 text-xs select-none">{index + 1}</td>
                      {visibleCols.map(col => (
                        <td key={col.id} className="px-3 py-2">
                          {col.builtin === "status" ? (
                            <select value={item.status}
                              onChange={e => updateItem(item.id, "status", e.target.value as Status)}
                              className={`text-sm px-2 py-1 rounded-full font-medium border-0 outline-none cursor-pointer ${STATUS_STYLE[item.status] ?? STATUS_STYLE["未着手"]}`}>
                              {(col.dropdown?.choices.length ? col.dropdown.choices : STATUS_OPTIONS).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : col.builtin === "deadline" || col.builtin === "completedDate" ? (
                            <input type="date"
                              value={col.builtin === "deadline" ? item.deadline : item.completedDate}
                              onChange={e => updateItem(item.id, col.builtin!, e.target.value)}
                              className="w-full text-sm bg-transparent border-0 outline-none text-gray-700 dark:text-gray-300" />
                          ) : col.builtin === "taskName" ? (
                            <input value={item.taskName}
                              onChange={e => updateItem(item.id, "taskName", e.target.value)}
                              placeholder="タスクの内容を入力"
                              className={`w-full text-sm bg-transparent border-0 outline-none placeholder-gray-300 dark:placeholder-gray-700 min-w-48 ${
                                done ? "line-through text-gray-600 dark:text-gray-500" : "text-gray-900 dark:text-gray-100"
                              }`} />
                          ) : col.dropdown?.enabled && col.dropdown.choices.length > 0 ? (
                            // ドロップダウン設定ありの列
                            <select
                              value={col.builtin ? (item[col.builtin] as string) : (item.customFields[col.id] ?? "")}
                              onChange={e => col.builtin
                                ? updateItem(item.id, col.builtin, e.target.value)
                                : updateCustomField(item.id, col.id, e.target.value)
                              }
                              className="w-full text-sm bg-transparent border-0 outline-none cursor-pointer text-gray-700 dark:text-gray-300">
                              <option value="">—</option>
                              {col.dropdown.choices.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : col.builtin ? (
                            <input value={item[col.builtin] as string}
                              onChange={e => updateItem(item.id, col.builtin!, e.target.value)}
                              placeholder="—"
                              className="w-full text-sm bg-transparent border-0 outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600" />
                          ) : (
                            <input value={item.customFields[col.id] ?? ""}
                              onChange={e => updateCustomField(item.id, col.id, e.target.value)}
                              placeholder="—"
                              className="w-full text-sm bg-transparent border-0 outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600" />
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => moveItem(index, -1)} disabled={index === 0}
                            className="text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-20 p-0.5">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => moveItem(index, 1)} disabled={index === data.items.length - 1}
                            className="text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-20 p-0.5">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeItem(item.id)}
                            className="text-gray-300 dark:text-gray-700 hover:text-red-400 p-0.5 ml-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800">
            <button onClick={addItem}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-500 hover:text-yo dark:hover:text-yo transition-colors">
              <Plus className="w-4 h-4" />
              行を追加
            </button>
          </div>
        </div>
      </main>

      {/* Excel プレビューモーダル */}
      {previewFormat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewFormat(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[95vh] w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                  {PRINT_FORMATS.find(f => f.id === previewFormat)?.icon}{" "}
                  {PRINT_FORMATS.find(f => f.id === previewFormat)?.label} — プレビュー
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">※ Excel出力との見た目は若干異なります</div>
              </div>
              <button onClick={() => setPreviewFormat(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* カラー選択 */}
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <span className="text-xs text-gray-600 dark:text-gray-400 shrink-0">カラー</span>
              <div className="flex gap-2">
                {(Object.entries(COLOR_MAP) as [ColorScheme, typeof COLOR_MAP[ColorScheme]][]).map(([key, val]) => (
                  <button key={key} onClick={() => setColorScheme(key)}
                    title={key}
                    style={{ background: val.primary }}
                    className={`w-6 h-6 rounded-full transition-all ${colorScheme === key ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-110"}`}
                  />
                ))}
              </div>
            </div>

            {/* プレビュー本体（A4縦スケール） */}
            <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 p-6">
              <div className="mx-auto" style={{ width: 595, transformOrigin: "top center" }}>
                <div className="shadow-xl" style={{ width: 595, minHeight: 842, background: "#fff" }}>
                  {previewFormat === "standard"  && <StandardTemplate  data={data} colorScheme={colorScheme} />}
                  {previewFormat === "checklist" && <ChecklistTemplate data={data} colorScheme={colorScheme} />}
                  {previewFormat === "business"  && <BusinessTemplate  data={data} colorScheme={colorScheme} />}
                </div>
              </div>
            </div>

            {/* フッター */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0 gap-3">
              <button onClick={() => { setPreviewFormat(null); setShowExcelModal(true); }}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                ← フォーマットを変更
              </button>
              <button
                onClick={() => { exportToExcel(data, previewFormat, colorScheme).catch(console.error); setPreviewFormat(null); }}
                className="flex items-center gap-2 px-5 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
                <Download className="w-4 h-4" />
                このフォーマットでダウンロード
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 印刷エリア（通常時は画面外、印刷時のみ表示） */}
      {printFormat && (
        <div id="yoshinoya-print" style={{ position: "fixed", top: 0, left: "-9999px", width: "210mm" }}>
          {printFormat === "standard"  && <StandardTemplate  data={data} colorScheme={colorScheme} />}
          {printFormat === "checklist" && <ChecklistTemplate data={data} colorScheme={colorScheme} />}
          {printFormat === "business"  && <BusinessTemplate  data={data} colorScheme={colorScheme} />}
        </div>
      )}
    </div>
  );
}

// ─── Print Modal ──────────────────────────────────────────────────────────────

const PRINT_FORMATS: { id: PrintFormat; label: string; description: string; icon: string }[] = [
  { id: "standard",  label: "スタンダード",   description: "タイトル帯＋進捗バー＋表。汎用的な定番スタイル", icon: "📋" },
  { id: "checklist", label: "チェックシート", description: "□大きめ・カテゴリ別グループ・記入欄あり。紙運用に最適", icon: "✅" },
  { id: "business",  label: "ビジネス報告",  description: "会社名・承認者欄＋備考欄。報告書・提出用スタイル", icon: "📊" },
];

function FormatModal({ mode, onSelect, onClose }: { mode: "print" | "excel"; onSelect: (f: PrintFormat) => void; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-11 z-30 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {mode === "print" ? "印刷フォーマットを選択" : "Excelフォーマットを選択"}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2">
        {PRINT_FORMATS.map(fmt => (
          <button key={fmt.id} onClick={() => onSelect(fmt.id)}
            className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-yo hover:bg-yo-light dark:hover:bg-orange-900/20 transition-all group">
            <span className="text-2xl shrink-0">{fmt.icon}</span>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-yo">{fmt.label}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{fmt.description}</div>
            </div>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-500 mt-3 text-center">
        {mode === "print"
          ? "選択すると印刷ダイアログが開きます。「PDFとして保存」でPDF出力できます。"
          : "選択したフォーマットでExcelファイルをダウンロードします。"}
      </p>
    </div>
  );
}

// ─── 共通 ─────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
