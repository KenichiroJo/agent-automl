/**
 * ChatLayout - シンプルな2カラムチャットレイアウト（案1: チャット統合型）
 *
 * 左: チャット履歴サイドバー
 * 右: メインチャットエリア（クイックアクション + 会話）
 *
 * CONTEXTとINSIGHTSはチャット内にインライン表示
 */
import { type ReactNode } from 'react';

export interface ChatLayoutProps {
  /** 左カラム: チャット履歴サイドバー */
  sidebar?: ReactNode;
  /** メインコンテンツ（ヘッダー + クイックアクション + 会話エリア） */
  children: ReactNode;
}

export function ChatLayout({
  sidebar,
  children,
}: ChatLayoutProps) {
  return (
    <div className="chat flex h-screen bg-background">
      {/* 左カラム: サイドバー（ChatSidebarが独自にスタイリング） */}
      {sidebar}

      {/* 右カラム: メインチャットエリア */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-background">
        {children}
      </main>
    </div>
  );
}

export default ChatLayout;
