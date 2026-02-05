/**
 * Analysis Layout - 3カラム分析ビュー
 *
 * 左: コンテキストパネル（プロジェクト・モデル情報）
 * 中央: 会話エリア（メインのインタラクション）
 * 右: インサイトパネル（チャートを常時表示）
 *
 * モバイル対応:
 * - sm: 1カラム（会話のみ）、パネルはドロワーで表示
 * - md: 2カラム（会話 + インサイト）
 * - lg: 3カラム（フル表示）
 *
 * スクロール同期: 左・右パネルはメインエリアのスクロールに連動
 */
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Menu, ChevronLeft, ChevronRight, PanelLeftClose, PanelRightClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export interface AnalysisLayoutProps {
  /** 左カラム: コンテキストパネル */
  contextPanel?: ReactNode;
  /** 中央カラム: メインコンテンツ（会話エリア） */
  children: ReactNode;
  /** 右カラム: インサイトパネル */
  insightPanel?: ReactNode;
  /** ヘッダー */
  header?: ReactNode;
}

export function AnalysisLayout({
  contextPanel,
  children,
  insightPanel,
  header,
}: AnalysisLayoutProps) {
  const [isContextOpen, setIsContextOpen] = useState(true);
  const [isInsightOpen, setIsInsightOpen] = useState(true);
  const [isMobileContextOpen, setIsMobileContextOpen] = useState(false);
  const [isMobileInsightOpen, setIsMobileInsightOpen] = useState(false);

  // スクロール同期用のref
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // メインエリアのスクロールを左右パネルに同期
  useEffect(() => {
    const mainEl = mainScrollRef.current;
    if (!mainEl) return;

    const handleScroll = () => {
      const scrollTop = mainEl.scrollTop;
      const scrollPercent = scrollTop / (mainEl.scrollHeight - mainEl.clientHeight);

      if (leftPanelRef.current) {
        const leftMax = leftPanelRef.current.scrollHeight - leftPanelRef.current.clientHeight;
        leftPanelRef.current.scrollTop = scrollPercent * leftMax;
      }
      if (rightPanelRef.current) {
        const rightMax = rightPanelRef.current.scrollHeight - rightPanelRef.current.clientHeight;
        rightPanelRef.current.scrollTop = scrollPercent * rightMax;
      }
    };

    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ヘッダー */}
      {header && (
        <header className="flex-shrink-0 border-b border-border bg-card">
          {header}
        </header>
      )}

      {/* モバイルナビゲーション (sm/md) */}
      <div className="lg:hidden flex items-center justify-between p-2 border-b border-border bg-card">
        {/* 左パネルトグル */}
        <Sheet open={isMobileContextOpen} onOpenChange={setIsMobileContextOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Menu className="h-4 w-4" />
              <span className="hidden sm:inline">コンテキスト</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0">
            <div className="h-full overflow-y-auto">
              {contextPanel}
            </div>
          </SheetContent>
        </Sheet>

        <span className="text-sm font-medium text-foreground">DataRobot Agent</span>

        {/* 右パネルトグル */}
        <Sheet open={isMobileInsightOpen} onOpenChange={setIsMobileInsightOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <span className="hidden sm:inline">インサイト</span>
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0">
            <div className="h-full overflow-y-auto">
              {insightPanel}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* メインコンテンツエリア */}
      <div className="flex flex-1 min-h-0">
        {/* 左カラム: コンテキストパネル (lg以上で表示) */}
        <aside
          className={cn(
            'hidden lg:flex flex-col border-r border-border bg-card transition-all duration-300',
            isContextOpen ? 'w-64' : 'w-12'
          )}
        >
          {/* パネルトグルボタン */}
          <div className="flex items-center justify-end p-2 border-b border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsContextOpen(!isContextOpen)}
              className="h-8 w-8 p-0"
            >
              {isContextOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* パネルコンテンツ */}
          {isContextOpen && (
            <div ref={leftPanelRef} className="flex-1 overflow-y-auto scrollbar-thin">
              {contextPanel}
            </div>
          )}
        </aside>

        {/* 中央カラム: 会話エリア */}
        <main ref={mainScrollRef} className="flex-1 flex flex-col min-w-0 bg-background overflow-y-auto">
          {children}
        </main>

        {/* 右カラム: インサイトパネル (lg以上で表示) */}
        <aside
          className={cn(
            'hidden lg:flex flex-col border-l border-border bg-card transition-all duration-300',
            isInsightOpen ? 'w-80' : 'w-12'
          )}
        >
          {/* パネルトグルボタン */}
          <div className="flex items-center justify-start p-2 border-b border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsInsightOpen(!isInsightOpen)}
              className="h-8 w-8 p-0"
            >
              {isInsightOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* パネルコンテンツ */}
          {isInsightOpen && (
            <div ref={rightPanelRef} className="flex-1 overflow-y-auto scrollbar-thin">
              {insightPanel}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default AnalysisLayout;
