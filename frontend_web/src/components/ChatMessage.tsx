import { memo, useMemo, useState, Component, type ReactNode, type ErrorInfo } from 'react';
import {
  User,
  Bot,
  Cog,
  Hammer,
  Wrench,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from '@/components/ui/code-block';
import { cn } from '@/lib/utils';
import type { ContentPart, TextUIPart, ToolInvocationUIPart } from '@/types/message';
import { useChatContext } from '@/hooks/use-chat-context';
import type { ChatMessageEvent } from '@/types/events';
import { Badge } from '@/components/ui/badge';
import { InsightRenderer, parseInsightFromMessage } from '@/components/insights';

interface ChatMessageErrorBoundaryProps {
  children: ReactNode;
  message: ChatMessageEvent;
}

interface ChatMessageErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ChatMessageErrorBoundary extends Component<
  ChatMessageErrorBoundaryProps,
  ChatMessageErrorBoundaryState
> {
  constructor(props: ChatMessageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChatMessageErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ChatMessage render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={'flex gap-3 p-4 rounded-lg bg-card'}>
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-destructive/20 text-destructive">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-destructive">Failed to render message</span>
            </div>
            <CodeBlock code={JSON.stringify(this.props.message, null, 2)} />
            {this.state.error && (
              <div className="text-xs text-muted-foreground my-2">
                <div>{this.state.error.message}</div>
                <div>{this.state.error.stack}</div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const MarkdownRegExp = /^```markdown\s*|\s*```$/g;

export function UniversalContentPart({ part }: { part: ContentPart }) {
  if (part.type === 'text') {
    return <TextContentPart part={part} />;
  }
  if (part.type === 'tool-invocation') {
    return <ToolInvocationPart part={part} />;
  }
  return <CodeBlock code={JSON.stringify(part, null, '  ')} />;
}

const MarkdownBlock = memo(({ block, index }: { block: string; index: number }) => {
  if (block.startsWith('```markdown')) {
    const inner = block.replace(MarkdownRegExp, '');
    return (
      <div key={index} className="markdown-block">
        <ReactMarkdown>{inner}</ReactMarkdown>
      </div>
    );
  } else {
    return <ReactMarkdown key={index}>{block}</ReactMarkdown>;
  }
});

export function TextContentPart({ part }: { part: TextUIPart }) {
  // インサイトデータ（JSON形式）を検出してレンダリング
  const insight = useMemo(() => parseInsightFromMessage(part.text), [part.text]);

  // JSONブロックを除いたテキスト部分を取得
  const textWithoutJson = useMemo(() => {
    if (!insight) return part.text;
    // ```json ... ``` ブロックを除去
    // サポートされる全インサイトタイプに対応
    const insightTypes = [
      'feature_impact', 'model_metrics', 'project_list', 'model_comparison',
      'roc_curve', 'lift_chart', 'feature_effects', 'prediction_explanation',
      'confusion_matrix', 'residuals', 'time_series_forecast'
    ].join('|');
    return part.text
      .replace(/```json[\s\S]*?```/g, '')
      .replace(new RegExp(`\\{[\\s\\S]*"type"\\s*:\\s*"(${insightTypes})"[\\s\\S]*\\}`, 'g'), '')
      .trim();
  }, [part.text, insight]);

  const blocks = textWithoutJson.split(/(```markdown[\s\S]*?```)/g);

  return (
    <>
      {/* テキスト部分をMarkdownでレンダリング */}
      {textWithoutJson && blocks.map((block, i) => (
        <MarkdownBlock key={i} block={block} index={i} />
      ))}
      {/* インサイトコンポーネントをレンダリング */}
      {insight && <InsightRenderer insight={insight} />}
    </>
  );
}

export function ToolInvocationPart({ part }: { part: ToolInvocationUIPart }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toolInvocation } = part;
  const { toolName } = toolInvocation;
  const ctx = useChatContext();
  const tool = ctx.getTool(toolName);
  if (tool?.render) {
    return tool.render({ status: 'complete', args: toolInvocation.args });
  }
  if (tool?.renderAndWait) {
    return tool.renderAndWait({
      status: 'complete',
      args: toolInvocation.args,
      callback: event => {
        console.log(event);
      },
    });
  }

  const hasResult = !!toolInvocation.result;

  return (
    <div className="my-3 rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-muted/30 overflow-hidden shadow-sm">
      {/* Header - クリックで展開/折りたたみ */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/30 w-full text-left hover:bg-muted/40 transition-all"
      >
        {/* 展開/折りたたみアイコン */}
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-[#81FBA5] flex-shrink-0" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tool</span>
        </div>
        <Badge variant="secondary" className="font-mono text-xs bg-[#81FBA5]/10 text-[#81FBA5] border border-[#81FBA5]/30">
          {toolInvocation.toolName}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {hasResult ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400" />
              <span className="text-xs text-green-500 font-medium">完了</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 text-[#81FBA5] animate-spin" />
              <span className="text-xs text-muted-foreground">実行中...</span>
            </div>
          )}
          {isExpanded ? (
            <Minimize2 className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Maximize2 className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* 展開時のみ詳細を表示 */}
      {isExpanded && (
        <>
          {/* Arguments Section */}
          {toolInvocation.args && (
            <div className="border-b border-border/30 last:border-b-0">
              <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/10 border-b border-border/20">
                <ChevronRight className="w-3 h-3" />
                Arguments
              </div>
              <CodeBlock code={JSON.stringify(toolInvocation.args, null, '  ')} />
            </div>
          )}

          {/* Result Section */}
          {toolInvocation.result && (
            <div>
              <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/10 border-b border-border/20">
                <ChevronRight className="w-3 h-3" />
                Result
              </div>
              <CodeBlock code={toolInvocation.result} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChatMessageContent({
  id,
  role,
  threadId,
  resourceId,
  content,
  type = 'default',
}: ChatMessageEvent) {
  let Icon = useMemo(() => {
    if (role === 'user') {
      return User;
    } else if (role === 'system') {
      return Cog;
    } else if (content.parts.some(({ type }) => type === 'tool-invocation')) {
      return Hammer;
    } else {
      return Bot;
    }
  }, [role, content.parts]);

  return (
    <div
      className={cn(
        'flex gap-4 p-4 rounded-xl transition-all',
        role === 'user' 
          ? 'bg-gradient-to-br from-muted/80 to-muted/40 border border-border/50' 
          : 'bg-gradient-to-br from-card to-card/80 border border-border/30 shadow-sm'
      )}
      data-message-id={id}
      data-thread-id={threadId}
      data-resource-id={resourceId}
      data-testid={`${type}-${role}-message-${id}`}
    >
      <div className="flex-shrink-0">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center shadow-sm',
            role === 'user'
              ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground'
              : role === 'assistant'
                ? 'bg-gradient-to-br from-[#81FBA5]/20 to-[#81FBA5]/10 text-[#81FBA5] border border-[#81FBA5]/30'
                : 'bg-gradient-to-br from-accent to-accent/80 text-accent-foreground'
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn(
            "text-sm font-semibold capitalize",
            role === 'user' ? 'text-foreground' : 'text-[#81FBA5]'
          )}>
            {role === 'user' ? 'You' : role === 'assistant' ? 'Agent' : role}
          </span>
        </div>
        <div className="text-sm whitespace-pre-wrap break-words content leading-relaxed">
          {content.parts.map((part, i) => (
            <UniversalContentPart key={i} part={part} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatMessage(props: ChatMessageEvent) {
  return (
    <ChatMessageErrorBoundary message={props}>
      <ChatMessageContent {...props} />
    </ChatMessageErrorBoundary>
  );
}

export const ChatMessagesMemo = memo(ChatMessage);
