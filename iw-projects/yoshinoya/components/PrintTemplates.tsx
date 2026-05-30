import type { ChecklistData } from "@/lib/types";

export type PrintFormat  = "standard" | "checklist" | "business";
export type ColorScheme  = "blue" | "green" | "gray" | "red" | "purple" | "teal";

export const COLOR_MAP: Record<ColorScheme, { primary: string; light: string; dark: string }> = {
  blue:   { primary: "#2563EB", light: "#EFF6FF", dark: "#1E40AF" },
  green:  { primary: "#16A34A", light: "#F0FDF4", dark: "#166534" },
  gray:   { primary: "#374151", light: "#F9FAFB", dark: "#111827" },
  red:    { primary: "#DC2626", light: "#FEF2F2", dark: "#991B1B" },
  purple: { primary: "#7C3AED", light: "#F5F3FF", dark: "#5B21B6" },
  teal:   { primary: "#0891B2", light: "#F0FDFA", dark: "#0E7490" },
};

export const DEFAULT_COLOR: ColorScheme = "blue";

function groupByCategory(items: ChecklistData["items"]) {
  const map = new Map<string, ChecklistData["items"]>();
  items.forEach(item => {
    const key = item.category || "その他";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  });
  return map;
}

const BASE: React.CSSProperties = {
  fontFamily: "'Yu Gothic Medium', 'YuGothic', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif",
  fontSize: 9.5,
  color: "#1a1a1a",
  padding: "18mm 14mm",
  boxSizing: "border-box",
  lineHeight: 1.5,
};

// ─── スタンダード ──────────────────────────────────────────────────────────────

export function StandardTemplate({ data, colorScheme = DEFAULT_COLOR }: { data: ChecklistData; colorScheme?: ColorScheme }) {
  const { primary } = COLOR_MAP[colorScheme];
  const vis = data.columns.filter(c => c.visible);

  return (
    <div style={BASE}>
      {/* タイトルブロック */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 3, background: primary, alignSelf: "stretch", borderRadius: 2, flexShrink: 0, minHeight: 40 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#111", letterSpacing: "-0.01em", marginBottom: 5 }}>{data.title}</div>
          <div style={{ fontSize: 8.5, color: "#888", display: "flex", gap: 18, flexWrap: "wrap" }}>
            {data.createdAt && <span>作成日　{data.createdAt}</span>}
            {data.author    && <span>作成者　{data.author}</span>}
            {data.updatedAt && <span>更新日　{data.updatedAt}</span>}
            {data.manager   && <span>管理者　{data.manager}</span>}
          </div>
        </div>
        <div style={{ fontSize: 8.5, color: "#aaa", flexShrink: 0, paddingTop: 2 }}>全 {data.items.length} 件</div>
      </div>

      {/* テーブル */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid #111" }}>
            <th style={TH_S}>No.</th>
            {vis.map(col => <th key={col.id} style={{ ...TH_S, textAlign: "left" }}>{col.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => {
            const done = item.checked || item.status === "完了";
            return (
              <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0", background: done ? COLOR_MAP[colorScheme].light : "transparent" }}>
                <td style={{ ...TD_S, color: "#bbb", textAlign: "center", paddingLeft: 0 }}>{i + 1}</td>
                {vis.map(col => (
                  <td key={col.id} style={{
                    ...TD_S,
                    color: done ? "#aaa" : "#1a1a1a",
                    textDecoration: done && col.builtin === "taskName" ? "line-through" : "none",
                    fontWeight: col.builtin === "taskName" ? 500 : 400,
                  }}>
                    {col.builtin ? (item[col.builtin as keyof typeof item] as string) ?? "" : (item.customFields[col.id] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── チェックシート ────────────────────────────────────────────────────────────

export function ChecklistTemplate({ data, colorScheme = DEFAULT_COLOR }: { data: ChecklistData; colorScheme?: ColorScheme }) {
  const { primary } = COLOR_MAP[colorScheme];
  const groups = groupByCategory(data.items);

  return (
    <div style={BASE}>
      {/* タイトル */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 3, background: primary, alignSelf: "stretch", borderRadius: 2, flexShrink: 0, minHeight: 40 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#111", letterSpacing: "-0.01em", marginBottom: 5 }}>{data.title}</div>
          <div style={{ fontSize: 8.5, color: "#888", display: "flex", gap: 18 }}>
            {data.author    && <span>作成者　{data.author}</span>}
            {data.createdAt && <span>日付　{data.createdAt}</span>}
            {data.manager   && <span>管理者　{data.manager}</span>}
          </div>
        </div>
      </div>

      {[...groups.entries()].map(([category, items]) => (
        <div key={category} style={{ marginBottom: 16 }}>
          {/* カテゴリ見出し */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 3, height: 12, background: primary, borderRadius: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 8.5, fontWeight: 700, color: primary, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>{category}</span>
            <div style={{ flex: 1, height: 1, background: "#f0f0f0" }} />
          </div>

          {/* ヘッダー */}
          <div style={{ display: "flex", fontSize: 8, color: "#999", fontWeight: 600, padding: "3px 0", borderBottom: "1px solid #e5e5e5", gap: 0 }}>
            <span style={{ width: 22, flexShrink: 0 }}>No.</span>
            <span style={{ flex: 1 }}>タスク名</span>
            <span style={{ width: 58, flexShrink: 0, textAlign: "center" as const }}>担当者</span>
            <span style={{ width: 58, flexShrink: 0, textAlign: "center" as const }}>期日</span>
            <span style={{ width: 70, flexShrink: 0, textAlign: "center" as const }}>確認欄</span>
          </div>

          {items.map((item, i) => {
            const done = item.checked || item.status === "完了";
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f5f5f5", gap: 0 }}>
                <span style={{ width: 22, fontSize: 8, color: "#ccc", flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 9, color: done ? "#bbb" : "#1a1a1a", textDecoration: done ? "line-through" : "none", fontWeight: 500 }}>{item.taskName}</span>
                <span style={{ width: 58, fontSize: 8.5, color: "#666", textAlign: "center" as const, flexShrink: 0 }}>{item.assignee || "—"}</span>
                <span style={{ width: 58, fontSize: 8.5, color: "#666", textAlign: "center" as const, flexShrink: 0 }}>{item.deadline || "—"}</span>
                <span style={{ width: 70, borderBottom: "1px solid #ddd", height: 14, flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── ビジネス報告 ──────────────────────────────────────────────────────────────

export function BusinessTemplate({ data, colorScheme = DEFAULT_COLOR }: { data: ChecklistData; colorScheme?: ColorScheme }) {
  const { primary, dark } = COLOR_MAP[colorScheme];
  const vis = data.columns.filter(c => c.visible);

  return (
    <div style={BASE}>
      {/* ヘッダーバー（細い） */}
      <div style={{ height: 3, background: primary, borderRadius: 2, marginBottom: 14 }} />

      {/* 会社情報グリッド */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 20px", marginBottom: 16, fontSize: 8.5, borderBottom: "1px solid #e5e5e5", paddingBottom: 14 }}>
        {[
          ["会社名", ""],
          ["部　署", ""],
          ["作成者", data.author],
          ["承認者", ""],
          ["作成日", data.createdAt],
          ["管理者", data.manager],
        ].map(([label, value], i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "2px 0", alignItems: "baseline" }}>
            <span style={{ color: "#999", width: 44, flexShrink: 0 }}>{label}</span>
            <span style={{ borderBottom: "1px solid #e5e5e5", flex: 1, color: "#1a1a1a", paddingBottom: 1 }}>{value || ""}</span>
          </div>
        ))}
      </div>

      {/* タイトルブロック */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
        <div style={{ width: 3, background: primary, alignSelf: "stretch", borderRadius: 2, flexShrink: 0, minHeight: 28 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111", letterSpacing: "-0.01em" }}>{data.title}</div>
        </div>
        <div style={{ fontSize: 8.5, color: "#aaa", flexShrink: 0 }}>全 {data.items.length} 件</div>
      </div>

      {/* テーブル */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid #111" }}>
            <th style={TH_S}>No.</th>
            {vis.map(col => <th key={col.id} style={{ ...TH_S, textAlign: "left" }}>{col.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => {
            const done = item.checked || item.status === "完了";
            return (
              <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ ...TD_S, color: "#bbb", textAlign: "center", paddingLeft: 0 }}>{i + 1}</td>
                {vis.map(col => (
                  <td key={col.id} style={{
                    ...TD_S,
                    color: done ? "#aaa" : "#1a1a1a",
                    textDecoration: done && col.builtin === "taskName" ? "line-through" : "none",
                    fontWeight: col.builtin === "taskName" ? 500 : 400,
                  }}>
                    {col.builtin ? (item[col.builtin as keyof typeof item] as string) ?? "" : (item.customFields[col.id] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 備考欄 */}
      <div style={{ marginTop: 20, borderTop: "1px solid #e5e5e5", paddingTop: 10 }}>
        <div style={{ fontSize: 8, color: "#bbb", marginBottom: 6, fontWeight: 600, letterSpacing: "0.05em" }}>REMARKS</div>
        <div style={{ height: 48, borderBottom: "1px solid #e5e5e5" }} />
      </div>
    </div>
  );
}

// ─── 共通スタイル ─────────────────────────────────────────────────────────────

const TH_S: React.CSSProperties = {
  padding: "6px 8px 6px 0",
  textAlign: "center",
  fontWeight: 600,
  fontSize: 8,
  color: "#555",
  letterSpacing: "0.03em",
  whiteSpace: "nowrap",
  background: "transparent",
};

const TD_S: React.CSSProperties = {
  padding: "6px 8px 6px 0",
  verticalAlign: "middle",
};
