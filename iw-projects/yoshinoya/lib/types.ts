export type Status = "未着手" | "進行中" | "保留" | "完了";

export type BuiltinColumnKey =
  | "category"
  | "taskName"
  | "deadline"
  | "assignee"
  | "status"
  | "reviewer"
  | "completedDate"
  | "notes";

export interface ColumnDropdown {
  enabled: boolean;
  choices: string[];
}

export interface ColumnDef {
  id: string;
  label: string;
  builtin?: BuiltinColumnKey;
  visible: boolean;
  dropdown?: ColumnDropdown;
}

export interface ChecklistItem {
  id: string;
  category: string;
  taskName: string;
  deadline: string;
  assignee: string;
  status: Status;
  reviewer: string;
  completedDate: string;
  notes: string;
  checked: boolean;
  customFields: Record<string, string>;
}

export interface ChecklistData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  manager: string;
  columns: ColumnDef[];
  items: ChecklistItem[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  emoji: string;
  defaultTitle: string;
  items: Omit<ChecklistItem, "id">[];
}

export const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: "category",      label: "カテゴリ",   builtin: "category",      visible: true },
  { id: "taskName",      label: "タスク名",   builtin: "taskName",      visible: true },
  { id: "deadline",      label: "期日",       builtin: "deadline",      visible: true },
  { id: "assignee",      label: "担当者",     builtin: "assignee",      visible: true },
  { id: "status",        label: "ステータス", builtin: "status",        visible: true,  dropdown: { enabled: true, choices: ["未着手", "進行中", "保留", "完了"] } },
  { id: "reviewer",      label: "確認者",     builtin: "reviewer",      visible: false },
  { id: "completedDate", label: "完了日",     builtin: "completedDate", visible: false },
  { id: "notes",         label: "備考",       builtin: "notes",         visible: true },
];
