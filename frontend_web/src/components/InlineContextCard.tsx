/**
 * InlineContextCard - チャット内にインライン表示されるコンテキストカード
 *
 * プロジェクトやモデルの情報をカード形式で表示し、
 * クリックでコンテキストに設定できる
 */
import { useState } from 'react';
import {
  FolderOpen,
  Brain,
  Pin,
  Check,
  ChevronDown,
  ChevronRight,
  Star,
  Calendar,
  Hash,
  Target,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ================= Project Card =================

export interface ProjectCardData {
  id: string;
  name: string;
  target?: string;
  metric?: string;
  createdAt?: string;
  modelCount?: number;
}

export interface InlineProjectCardProps {
  project: ProjectCardData;
  isSelected?: boolean;
  onSelect?: (project: ProjectCardData) => void;
  onPin?: (project: ProjectCardData) => void;
  isPinned?: boolean;
}

export function InlineProjectCard({
  project,
  isSelected = false,
  onSelect,
  onPin,
  isPinned = false,
}: InlineProjectCardProps) {
  return (
    <div
      className={cn(
        'my-2 p-3 rounded-lg border transition-all',
        isSelected
          ? 'border-[#81FBA5] bg-[#81FBA5]/10'
          : 'border-border bg-card hover:border-[#81FBA5]/50'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <FolderOpen className="h-5 w-5 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm truncate">{project.name}</h4>
            {isSelected && (
              <Badge variant="outline" className="text-[10px] border-[#81FBA5] text-[#81FBA5]">
                選択中
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {project.id.slice(0, 8)}...
            </span>
            {project.target && (
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {project.target}
              </span>
            )}
            {project.modelCount !== undefined && (
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {project.modelCount} models
              </span>
            )}
            {project.createdAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {project.createdAt}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onPin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onPin(project)}
            >
              <Pin className={cn('h-3.5 w-3.5', isPinned && 'text-[#81FBA5] fill-current')} />
            </Button>
          )}
          {onSelect && !isSelected && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => onSelect(project)}
            >
              <Check className="h-3 w-3" />
              選択
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ================= Model Card =================

export interface ModelCardData {
  id: string;
  name: string;
  type?: string;
  score?: number;
  metric?: string;
  isRecommended?: boolean;
  rank?: number;
}

export interface InlineModelCardProps {
  model: ModelCardData;
  isSelected?: boolean;
  onSelect?: (model: ModelCardData) => void;
  onViewDetails?: (model: ModelCardData) => void;
  onCompare?: (model: ModelCardData) => void;
}

export function InlineModelCard({
  model,
  isSelected = false,
  onSelect,
  onViewDetails,
  onCompare,
}: InlineModelCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={cn(
        'my-2 p-3 rounded-lg border transition-all',
        isSelected
          ? 'border-[#81FBA5] bg-[#81FBA5]/10'
          : 'border-border bg-card hover:border-[#81FBA5]/50'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
            model.isRecommended ? 'bg-yellow-500/10' : 'bg-purple-500/10'
          )}
        >
          {model.isRecommended ? (
            <Star className="h-5 w-5 text-yellow-500" />
          ) : (
            <Brain className="h-5 w-5 text-purple-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-sm">{model.name}</h4>
            {model.isRecommended && (
              <Badge className="text-[10px] bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">
                ⭐ 推奨
              </Badge>
            )}
            {isSelected && (
              <Badge variant="outline" className="text-[10px] border-[#81FBA5] text-[#81FBA5]">
                選択中
              </Badge>
            )}
            {model.rank && (
              <Badge variant="secondary" className="text-[10px]">
                #{model.rank}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {model.score !== undefined && model.metric && (
              <span className="flex items-center gap-1 font-medium text-foreground">
                <TrendingUp className="h-3 w-3 text-[#81FBA5]" />
                {model.metric}: {model.score.toFixed(5)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {model.id.slice(0, 8)}...
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* アクションボタン */}
      {isExpanded && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          {onSelect && !isSelected && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => onSelect(model)}
            >
              <Check className="h-3 w-3" />
              選択
            </Button>
          )}
          {onViewDetails && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => onViewDetails(model)}
            >
              詳細を見る
            </Button>
          )}
          {onCompare && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => onCompare(model)}
            >
              比較する
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ================= Model List (テーブル形式のレスポンスをカード化) =================

export interface ModelListData {
  models: ModelCardData[];
  projectId?: string;
  projectName?: string;
}

export interface InlineModelListProps {
  data: ModelListData;
  selectedModelId?: string;
  onSelectModel?: (model: ModelCardData) => void;
  onViewDetails?: (model: ModelCardData) => void;
}

export function InlineModelList({
  data,
  selectedModelId,
  onSelectModel,
  onViewDetails,
}: InlineModelListProps) {
  const [showAll, setShowAll] = useState(false);
  const displayModels = showAll ? data.models : data.models.slice(0, 5);

  return (
    <div className="my-3">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="h-4 w-4 text-[#81FBA5]" />
        <span className="text-sm font-medium">
          モデル一覧 ({data.models.length}件)
        </span>
        {data.projectName && (
          <Badge variant="secondary" className="text-xs">
            {data.projectName}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {displayModels.map((model, index) => (
          <InlineModelCard
            key={model.id}
            model={{ ...model, rank: index + 1 }}
            isSelected={model.id === selectedModelId}
            onSelect={onSelectModel}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>

      {data.models.length > 5 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? '折りたたむ' : `他 ${data.models.length - 5} 件を表示`}
        </Button>
      )}
    </div>
  );
}

export default InlineProjectCard;
