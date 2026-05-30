import type { ChecklistData } from "./types";
import type { PrintFormat, ColorScheme } from "@/components/PrintTemplates";

export async function exportToExcel(data: ChecklistData, format: PrintFormat = "standard", colorScheme: ColorScheme = "blue") {
  const res = await fetch("/api/export", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ data, format, colorScheme }),
  });

  if (!res.ok) throw new Error("Excel出力に失敗しました");

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${data.title}_${data.updatedAt}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
