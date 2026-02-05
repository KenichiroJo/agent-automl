/**
 * Context Panel - 左カラム
 *
 * 現在のプロジェクト・モデル情報と履歴を表示
 */
import { useState } from 'react';
import {
  FolderOpen,
  Brain,
  Clock,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Target,
  Calendar,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ProjectInfo {
  id: string;
  name: string;
  target?: string;
  metric?: string;
  createdAt?: string;
  modelCount?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  type?: string;
  score?: number;
  metric?: string;
  isRecommended?: boolean;
}

export interface RecentActivity {
  id: string;
  type: 'project' | 'model' | 'insight';
  name: string;
  timestamp?: string;
}

export interface ContextPanelProps {
  /** 現在選択中のプロジェクト */
  currentProject?: ProjectInfo;
  /** 現在選択中のモデル */
  currentModel?: ModelInfo;
  /** 最近のアクティビティ */
  recentActivities?: RecentActivity[];
  /** プロジェクト選択時のコールバック */
  onProjectSelect?: (project: ProjectInfo) => void;
  /** モデル選択時のコールバック */
  onModelSelect?: (model: ModelInfo) => void;
}

/**
 * CollapsibleSection - 折りたたみ可能なセクション
 */
function CollapsibleSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <Button
        variant="ghost"
        className="w-full justify-between p-3 h-auto rounded-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
      {isOpen && (
        <div className="p-3 pt-0 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

export function ContextPanel({
  currentProject,
  currentModel,
  recentActivities = [],
}: ContextPanelProps) {
  const [isProjectOpen, setIsProjectOpen] = useState(true);
  const [isModelOpen, setIsModelOpen] = useState(true);
  const [isRecentOpen, setIsRecentOpen] = useState(true);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* ヘッダー */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-6 bg-[#81FBA5] rounded-full" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Context
          </h2>
        </div>

        {/* 現在のプロジェクト */}
        <CollapsibleSection
          title="Project"
          icon={<FolderOpen className="h-4 w-4 text-[#81FBA5]" />}
          isOpen={isProjectOpen}
          onToggle={() => setIsProjectOpen(!isProjectOpen)}
        >
          {currentProject ? (
            <div className="space-y-3 mt-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium truncate">
                  {currentProject.name}
                </p>
              </div>
              {currentProject.target && (
                <div className="flex items-center gap-2">
                  <Target className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Target: {currentProject.target}
                  </span>
                </div>
              )}
              {currentProject.metric && (
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Metric: {currentProject.metric}
                  </span>
                </div>
              )}
              {currentProject.createdAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {currentProject.createdAt}
                  </span>
                </div>
              )}
              {currentProject.modelCount && (
                <Badge variant="secondary" className="text-xs">
                  <Layers className="h-3 w-3 mr-1" />
                  {currentProject.modelCount} models
                </Badge>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">
                プロジェクトが選択されていません
              </p>
            </div>
          )}
        </CollapsibleSection>

        {/* 現在のモデル */}
        <CollapsibleSection
          title="Model"
          icon={<Brain className="h-4 w-4 text-[#81FBA5]" />}
          isOpen={isModelOpen}
          onToggle={() => setIsModelOpen(!isModelOpen)}
        >
          {currentModel ? (
            <div className="space-y-3 mt-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium truncate">
                  {currentModel.name}
                </p>
              </div>
              {currentModel.type && (
                <Badge variant="outline" className="text-xs">
                  {currentModel.type}
                </Badge>
              )}
              {currentModel.score !== undefined && currentModel.metric && (
                <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <span className="text-xs text-muted-foreground">
                    {currentModel.metric}
                  </span>
                  <span className="text-sm font-semibold text-[#81FBA5]">
                    {currentModel.score.toFixed(4)}
                  </span>
                </div>
              )}
              {currentModel.isRecommended && (
                <Badge className="bg-[#81FBA5] text-black text-xs">
                  ★ Recommended
                </Badge>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <Brain className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">
                モデルが選択されていません
              </p>
            </div>
          )}
        </CollapsibleSection>

        {/* 最近のアクティビティ */}
        <CollapsibleSection
          title="Recent"
          icon={<Clock className="h-4 w-4 text-[#81FBA5]" />}
          isOpen={isRecentOpen}
          onToggle={() => setIsRecentOpen(!isRecentOpen)}
        >
          {recentActivities.length > 0 ? (
            <div className="space-y-2 mt-3">
              {recentActivities.slice(0, 5).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  {activity.type === 'project' && (
                    <FolderOpen className="h-3 w-3 text-blue-500" />
                  )}
                  {activity.type === 'model' && (
                    <Brain className="h-3 w-3 text-purple-500" />
                  )}
                  {activity.type === 'insight' && (
                    <BarChart3 className="h-3 w-3 text-[#81FBA5]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{activity.name}</p>
                    {activity.timestamp && (
                      <p className="text-xs text-muted-foreground">
                        {activity.timestamp}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <Clock className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">
                アクティビティがありません
              </p>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
