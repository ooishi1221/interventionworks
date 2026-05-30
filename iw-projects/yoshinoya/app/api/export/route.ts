import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { ChecklistData, ColumnDef, Status } from "@/lib/types";
import type { PrintFormat, ColorScheme } from "@/components/PrintTemplates";

// ─── カラー ───────────────────────────────────────────────────────────────────
const SCHEME_MAP: Record<ColorScheme, { primary: string; light: string }> = {
  blue:   { primary: "FF2563EB", light: "FFEFF6FF" },
  green:  { primary: "FF16A34A", light: "FFF0FDF4" },
  gray:   { primary: "FF374151", light: "FFF9FAFB" },
  red:    { primary: "FFDC2626", light: "FFFEF2F2" },
  purple: { primary: "FF7C3AED", light: "FFF5F3FF" },
  teal:   { primary: "FF0891B2", light: "FFF0FDFA" },
};

const C = {
  white:   "FFFFFFFF",
  dark:    "FF111111",
  mid:     "FF555555",
  muted:   "FF999999",
  faint:   "FFBBBBBB",
  rowDone: "FFF8F8F8",
  line:    "FFE8E8E8",  // 細線
  lineMd:  "FF111111",  // 太線（ヘッダー）
};

// 縦線なし・水平線のみのボーダー
const hLine     = (clr: string, s: "thin" | "medium" | "thick" = "thin") =>
  ({ bottom: { style: s, color: { argb: clr } } });
const hLineOnly = hLine(C.line);
const hLineMd   = hLine(C.lineMd, "medium");

const F = (sz = 9, bold = false, color = C.dark, name = "游ゴシック"): Partial<ExcelJS.Font> =>
  ({ size: sz, bold, color: { argb: color }, name });

const fill = (argb: string): ExcelJS.Fill =>
  ({ type: "pattern", pattern: "solid", fgColor: { argb } });

const STATUS_JP: Record<Status, string> = {
  未着手: "未着手", 進行中: "進行中", 保留: "保留", 完了: "完了",
};

function getVal(item: ChecklistData["items"][number], col: ColumnDef): string | number {
  if (!col.builtin) return item.customFields[col.id] ?? "";
  switch (col.builtin) {
    case "category":      return item.category;
    case "taskName":      return item.taskName;
    case "deadline":      return item.deadline;
    case "assignee":      return item.assignee;
    case "status":        return STATUS_JP[item.status];
    case "reviewer":      return item.reviewer;
    case "completedDate": return item.completedDate;
    case "notes":         return item.notes;
  }
}

function colWidth(col: ColumnDef): number {
  switch (col.builtin) {
    case "taskName":      return 32;
    case "notes":         return 24;
    case "category":      return 11;
    case "status":        return 10;
    case "deadline":
    case "completedDate": return 12;
    case "assignee":
    case "reviewer":      return 11;
    default:              return 15;
  }
}

function addValidations(ws: ExcelJS.Worksheet, vis: ColumnDef[], dataStart: number, count: number) {
  vis.forEach((col, i) => {
    const letter = ws.getColumn(i + 2).letter;
    const sqref  = `${letter}${dataStart}:${letter}${dataStart + count - 1}`;
    let choices: string[] | null = null;
    if (col.builtin === "status") {
      choices = col.dropdown?.choices.length ? col.dropdown.choices : ["未着手", "進行中", "保留", "完了"];
    } else if (col.dropdown?.enabled && col.dropdown.choices.length > 0) {
      choices = col.dropdown.choices;
    }
    if (choices) {
      (ws as any).dataValidations.add(sqref, {
        type: "list", allowBlank: true,
        formulae: [`"${choices.join(",")}"`],
        showDropDown: false, showErrorMessage: true,
        errorTitle: "入力エラー", error: "一覧から選択してください",
      });
    }
  });
}

function setPrintSetup(ws: ExcelJS.Worksheet, titleRow?: number) {
  ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  ws.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 };
  if (titleRow) ws.pageSetup.printTitlesRow = `${titleRow}:${titleRow}`;
}

// ─── スタンダード ──────────────────────────────────────────────────────────────
function buildStandard(ws: ExcelJS.Worksheet, data: ChecklistData, scheme: ColorScheme) {
  const { primary, light } = SCHEME_MAP[scheme];
  const vis   = data.columns.filter(c => c.visible);
  const ncols = vis.length + 1;
  const DH    = 7;

  ws.columns = [{ width: 5 }, ...vis.map(c => ({ width: colWidth(c) }))];

  // R1: タイトル（左にアクセントバー代わりの太線）
  ws.mergeCells(1, 1, 1, ncols);
  const t = ws.getCell(1, 1);
  t.value  = data.title;
  t.font   = { size: 16, bold: true, color: { argb: C.dark }, name: "游ゴシック" };
  t.border = { left: { style: "thick", color: { argb: primary } } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 32;

  // R2: メタ情報
  ws.mergeCells(2, 1, 2, ncols);
  const meta = ws.getCell(2, 1);
  meta.value = [
    data.createdAt && `作成日　${data.createdAt}`,
    data.author    && `作成者　${data.author}`,
    data.updatedAt && `更新日　${data.updatedAt}`,
    data.manager   && `管理者　${data.manager}`,
  ].filter(Boolean).join("　　　") || " ";
  meta.font  = F(8.5, false, C.muted);
  meta.border = hLineOnly;
  meta.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 18;

  // R3〜5: 余白
  ws.getRow(3).height = 4;
  ws.mergeCells(4, 1, 4, ncols);
  const cnt = ws.getCell(4, 1);
  cnt.value = `全 ${data.items.length} 件`;
  cnt.font  = F(8, false, C.faint);
  cnt.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  ws.getRow(4).height = 14;
  ws.getRow(5).height = 4;

  // R6: テーブルヘッダー
  const HEADER_ROW = 6;
  const hRow = ws.getRow(HEADER_ROW); hRow.height = 20;
  ["No.", ...vis.map(c => c.label)].forEach((label, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = label;
    cell.font  = F(8, true, C.mid);
    cell.border = hLineMd;
    cell.alignment = { horizontal: i === 0 ? "center" : "left", vertical: "middle" };
  });

  // R7〜: データ行
  data.items.forEach((item, i) => {
    const isDone = item.checked || item.status === "完了";
    const r      = DH + i;
    const row    = ws.getRow(r); row.height = 18;
    const bg     = isDone ? light : C.white;

    const no = row.getCell(1);
    no.value = i + 1; no.font = F(8, false, C.faint);
    no.fill = fill(bg); no.border = hLineOnly;
    no.alignment = { horizontal: "center", vertical: "middle" };

    vis.forEach((col, ci) => {
      const cell = row.getCell(ci + 2);
      cell.value = getVal(item, col) as string;
      cell.font  = {
        size: 9, name: "游ゴシック",
        color: { argb: isDone ? C.faint : C.dark },
        strike: !!(isDone && col.builtin === "taskName"),
        bold: col.builtin === "taskName",
      };
      cell.fill = fill(bg); cell.border = hLineOnly;
      cell.alignment = { horizontal: "left", vertical: "middle" };
    });
  });

  addValidations(ws, vis, DH, data.items.length);
  setPrintSetup(ws, HEADER_ROW);
}

// ─── チェックシート ────────────────────────────────────────────────────────────
function buildChecklist(ws: ExcelJS.Worksheet, data: ChecklistData, scheme: ColorScheme) {
  const { primary, light } = SCHEME_MAP[scheme];
  const groups = new Map<string, ChecklistData["items"]>();
  data.items.forEach(item => {
    const k = item.category || "未分類";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(item);
  });

  ws.columns = [{ width: 5 }, { width: 32 }, { width: 12 }, { width: 12 }, { width: 18 }];

  ws.mergeCells(1, 1, 1, 5);
  const t = ws.getCell(1, 1);
  t.value = data.title;
  t.font  = { size: 15, bold: true, color: { argb: C.dark }, name: "游ゴシック" };
  t.border = { left: { style: "thick", color: { argb: primary } } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, 5);
  const sub = ws.getCell(2, 1);
  sub.value = [data.author && `作成者　${data.author}`, data.createdAt && `日付　${data.createdAt}`, data.manager && `管理者　${data.manager}`].filter(Boolean).join("　　　");
  sub.font  = F(8.5, false, C.muted); sub.border = hLineOnly;
  sub.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 18; ws.getRow(3).height = 8;

  let r = 4;
  for (const [category, items] of groups) {
    // カテゴリ見出し
    ws.mergeCells(r, 1, r, 5);
    const ch = ws.getCell(r, 1);
    ch.value = category;
    ch.font  = F(8.5, true, primary);
    ch.border = { bottom: { style: "medium", color: { argb: primary } } };
    ch.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(r).height = 18; r++;

    // 列ヘッダー
    const hRow = ws.getRow(r); hRow.height = 16;
    ["No.", "タスク名", "担当者", "期日", "確認・記入欄"].forEach((l, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = l; cell.font = F(8, true, C.mid);
      cell.border = hLineOnly;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }); r++;

    items.forEach((item, i) => {
      const isDone = item.checked || item.status === "完了";
      const row = ws.getRow(r); row.height = 19;
      const bg = isDone ? light : C.white;

      const no = row.getCell(1); no.value = i + 1;
      no.font = F(8, false, C.faint); no.fill = fill(bg); no.border = hLineOnly;
      no.alignment = { horizontal: "center", vertical: "middle" };

      const task = row.getCell(2); task.value = item.taskName;
      task.font  = { size: 9, color: { argb: isDone ? C.faint : C.dark }, strike: isDone, bold: true, name: "游ゴシック" };
      task.fill = fill(bg); task.border = hLineOnly; task.alignment = { vertical: "middle" };

      [item.assignee, item.deadline, ""].forEach((v, ci) => {
        const cell = row.getCell(ci + 3); cell.value = v || "";
        cell.font = F(8.5, false, isDone ? C.faint : C.mid);
        cell.fill = fill(bg); cell.border = hLineOnly;
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      r++;
    });
    ws.getRow(r).height = 8; r++;
  }
  setPrintSetup(ws);
}

// ─── ビジネス報告 ──────────────────────────────────────────────────────────────
function buildBusiness(ws: ExcelJS.Worksheet, data: ChecklistData, scheme: ColorScheme) {
  const { primary, light } = SCHEME_MAP[scheme];
  const vis   = data.columns.filter(c => c.visible);
  const ncols = vis.length + 1;
  const DH    = 11;

  ws.columns = [{ width: 5 }, ...vis.map(c => ({ width: colWidth(c) }))];

  // アクセントバー（極細）
  ws.mergeCells(1, 1, 1, ncols);
  ws.getCell(1, 1).border = { bottom: { style: "medium", color: { argb: primary } } };
  ws.getRow(1).height = 4;

  // 会社情報グリッド（罫線なし、下線のみ）
  const half = Math.ceil(ncols / 2);
  const infoRows = [["会社名", ""], ["部　署", ""], ["作成者", data.author], ["承認者", ""], ["作成日", data.createdAt], ["管理者", data.manager]];
  infoRows.forEach(([label, value], ri) => {
    const row = ri + 2; ws.getRow(row).height = 18;
    ws.mergeCells(row, 1, row, 2);
    const lc = ws.getCell(row, 1);
    lc.value = label; lc.font = F(8.5, true, C.mid);
    lc.border = hLineOnly; lc.alignment = { vertical: "middle", indent: 1 };
    ws.mergeCells(row, 3, row, half);
    const vc = ws.getCell(row, 3);
    vc.value = value || ""; vc.font = F(8.5, false, C.dark);
    vc.border = hLineOnly; vc.alignment = { vertical: "middle" };
    if (ri % 2 === 0 && ri + 1 < infoRows.length) {
      const [rl2, rv2] = infoRows[ri + 1];
      ws.mergeCells(row, half + 1, row, half + 2);
      const lc2 = ws.getCell(row, half + 1);
      lc2.value = rl2; lc2.font = F(8.5, true, C.mid);
      lc2.border = hLineOnly; lc2.alignment = { vertical: "middle", indent: 1 };
      ws.mergeCells(row, half + 3, row, ncols);
      const vc2 = ws.getCell(row, half + 3);
      vc2.value = rv2 || ""; vc2.font = F(8.5, false, C.dark);
      vc2.border = hLineOnly; vc2.alignment = { vertical: "middle" };
    }
  });

  ws.getRow(8).height = 6;

  // タイトル
  ws.mergeCells(9, 1, 9, ncols);
  const title = ws.getCell(9, 1);
  title.value = data.title;
  title.font  = { size: 14, bold: true, color: { argb: C.dark }, name: "游ゴシック" };
  title.border = { left: { style: "thick", color: { argb: primary } } };
  title.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(9).height = 28;

  ws.mergeCells(10, 1, 10, ncols);
  const cnt = ws.getCell(10, 1);
  cnt.value = `全 ${data.items.length} 件`;
  cnt.font  = F(8, false, C.faint);
  cnt.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  ws.getRow(10).height = 14;

  // ヘッダー行
  const HEADER_ROW = 11;
  const hRow = ws.getRow(HEADER_ROW); hRow.height = 20;
  ["No.", ...vis.map(c => c.label)].forEach((l, i) => {
    const cell = hRow.getCell(i + 1); cell.value = l;
    cell.font = F(8, true, C.mid); cell.border = hLineMd;
    cell.alignment = { horizontal: i === 0 ? "center" : "left", vertical: "middle" };
  });

  // データ行
  data.items.forEach((item, i) => {
    const isDone = item.checked || item.status === "完了";
    const r = DH + i; const row = ws.getRow(r); row.height = 18;
    const bg = isDone ? light : C.white;

    const no = row.getCell(1); no.value = i + 1;
    no.font = F(8, false, C.faint); no.fill = fill(bg); no.border = hLineOnly;
    no.alignment = { horizontal: "center", vertical: "middle" };

    vis.forEach((col, ci) => {
      const cell = row.getCell(ci + 2);
      cell.value = getVal(item, col) as string;
      cell.font  = { size: 9, name: "游ゴシック", color: { argb: isDone ? C.faint : C.dark }, strike: !!(isDone && col.builtin === "taskName"), bold: col.builtin === "taskName" };
      cell.fill = fill(bg); cell.border = hLineOnly;
      cell.alignment = { horizontal: "left", vertical: "middle" };
    });
  });

  // 備考欄
  const noteR = DH + data.items.length + 1;
  ws.mergeCells(noteR, 1, noteR + 2, ncols);
  const noteCell = ws.getCell(noteR, 1);
  noteCell.font = F(8, true, C.faint); noteCell.value = "REMARKS";
  noteCell.border = { top: hLineOnly.bottom }; noteCell.alignment = { vertical: "top", indent: 1 };
  ws.getRow(noteR).height = 14;

  addValidations(ws, vis, DH, data.items.length);
  setPrintSetup(ws, HEADER_ROW);
}

// ─── Route ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { data, format = "standard", colorScheme = "blue" }: { data: ChecklistData; format: PrintFormat; colorScheme: ColorScheme } = await req.json();
  const wb = new ExcelJS.Workbook();
  wb.creator = "yoshinoya-checklist";
  const ws = wb.addWorksheet("チェックリスト");

  switch (format) {
    case "checklist": buildChecklist(ws, data, colorScheme); break;
    case "business":  buildBusiness(ws, data, colorScheme);  break;
    default:          buildStandard(ws, data, colorScheme);  break;
  }

  const buffer   = await wb.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${data.title}_${data.updatedAt}.xlsx`);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
