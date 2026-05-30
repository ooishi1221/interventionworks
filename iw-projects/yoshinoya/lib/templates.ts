import type { ChecklistItem, Template } from "./types";

function item(category: string, taskName: string): Omit<ChecklistItem, "id"> {
  return {
    category,
    taskName,
    deadline: "",
    assignee: "",
    status: "未着手",
    reviewer: "",
    completedDate: "",
    notes: "",
    checked: false,
    customFields: {},
  };
}

export const TEMPLATES: Template[] = [
  {
    id: "monthly",
    name: "月次業務",
    description: "毎月の定期業務・締め作業を管理",
    emoji: "📅",
    defaultTitle: "月次業務チェックリスト",
    items: [
      item("書類", "請求書の受領・確認"),
      item("書類", "領収書・経費精算の集計"),
      item("書類", "各種報告書の作成"),
      item("システム", "勤怠データの締め・確認"),
      item("システム", "システムへのデータ入力・反映"),
      item("連絡", "部門長への月次報告"),
      item("連絡", "関係部署への情報共有"),
      item("確認", "前月からの未完了事項の対応"),
    ],
  },
  {
    id: "project",
    name: "プロジェクト管理",
    description: "プロジェクトのタスク・進捗を一元管理",
    emoji: "🗂️",
    defaultTitle: "プロジェクト管理チェックリスト",
    items: [
      item("企画", "目的・目標の設定"),
      item("企画", "スケジュール・マイルストーン作成"),
      item("企画", "担当者・役割の決定"),
      item("準備", "必要資料・素材の収集"),
      item("準備", "関係者への事前共有・合意"),
      item("実施", "各タスクの実行・進捗管理"),
      item("確認", "成果物のレビュー・修正"),
      item("完了", "最終報告・振り返りの実施"),
    ],
  },
  {
    id: "handover",
    name: "業務引き継ぎ",
    description: "担当者変更時の引き継ぎ漏れ防止",
    emoji: "🤝",
    defaultTitle: "業務引き継ぎチェックリスト",
    items: [
      item("書類", "業務マニュアルの作成・更新"),
      item("書類", "関連ファイル・データの整理・共有"),
      item("業務", "定期業務の内容説明・引き継ぎ"),
      item("業務", "進行中案件の状況・経緯の共有"),
      item("業務", "イレギュラー対応・例外事項の説明"),
      item("システム", "アカウント・アクセス権限の移管"),
      item("連絡", "社内外の関係者へ担当変更の連絡"),
      item("確認", "引き継ぎ内容の最終確認・サイン"),
    ],
  },
  {
    id: "onboarding",
    name: "新人受入",
    description: "新入社員・異動者の初期対応を管理",
    emoji: "🌱",
    defaultTitle: "新人受入チェックリスト",
    items: [
      item("準備", "デスク・備品の準備"),
      item("準備", "PCセットアップ・アカウント発行"),
      item("準備", "社内ルール・規程集の共有"),
      item("説明", "業務フロー・担当業務の説明"),
      item("説明", "社内システムの使い方説明"),
      item("紹介", "関係者・各部門への紹介"),
      item("確認", "入社書類・提出物の確認"),
      item("フォロー", "1ヶ月後のフォロー面談の実施"),
    ],
  },
  {
    id: "blank",
    name: "空白",
    description: "ゼロから自由に作成",
    emoji: "✏️",
    defaultTitle: "チェックリスト",
    items: [
      item("", ""),
      item("", ""),
      item("", ""),
    ],
  },
];
