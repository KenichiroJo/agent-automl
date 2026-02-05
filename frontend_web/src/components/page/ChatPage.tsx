/**
 * ChatPage - 3カラム分析ビュー
 *
 * 左: コンテキストパネル（プロジェクト・モデル情報）
 * 中央: 会話エリア
 * 右: インサイトパネル
 */
import { PropsWithChildren, useState, useEffect, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import z from 'zod/v4';
import { Bot, Settings, Moon, Sun } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Chat } from '@/components/Chat';
import { useChatContext } from '@/hooks/use-chat-context';
import { useAgUiTool } from '@/hooks/use-ag-ui-tool';
import { useChatList } from '@/hooks/use-chat-list';
import { useContextState } from '@/hooks/use-context-state';
import { ChatMessages } from '@/components/ChatMessages';
import { ChatProgress } from '@/components/ChatProgress';
import { ChatTextInput } from '@/components/ChatTextInput';
import { ChatError } from '@/components/ChatError';
import { ChatMessagesMemo } from '@/components/ChatMessage';
import { StepEvent } from '@/components/StepEvent';
import { ThinkingEvent } from '@/components/ThinkingEvent';
import { ChatProvider } from '@/components/ChatProvider';
import { StartNewChat } from '@/components/StartNewChat';
import { ChatSidebar } from '@/components/ChatSidebar';
import {
  isErrorStateEvent,
  isMessageStateEvent,
  isStepStateEvent,
  isThinkingEvent,
} from '@/types/events';
import { type MessageResponse } from '@/api/chat/types';
import {
  AnalysisLayout,
  ContextPanel,
  InsightPanel,
  type ProjectInfo,
  type ModelInfo,
  type InsightItem,
} from '@/components/layout';
import { parseInsightFromMessage, type InsightData } from '@/components/insights';

const initialMessages: MessageResponse[] = [
  {
    id: uuid(),
    role: 'assistant',
    content: {
      format: 2,
      parts: [
        {
          type: 'text',
          text: `こんにちは！DataRobot AutoML/MLOps エージェントです。🤖

プロジェクトの分析、モデルの評価、予測の実行など、DataRobotに関することをお手伝いします。

**できること:**
- 📁 プロジェクト一覧の表示
- 📊 モデルの精度確認・比較
- 🔍 特徴量重要度（Feature Impact）の分析
- 📈 時系列予測の可視化
- 🚀 モデルのデプロイ

何を調べますか？`,
        },
      ],
    },
    createdAt: new Date(),
    type: 'initial',
  },
];

export function ChatPage({
  chatId,
  setChatId,
}: {
  chatId: string;
  setChatId: (id: string) => void;
}) {
  const {
    hasChat,
    isNewChat,
    chats,
    isLoadingChats,
    addChatHandler,
    deleteChatHandler,
    isLoadingDeleteChat,
  } = useChatList({
    chatId,
    setChatId,
    showStartChat: false,
  });

  return (
    <div className="chat">
      <ChatSidebar
        isLoading={isLoadingChats}
        chatId={chatId}
        chats={chats}
        onChatCreate={addChatHandler}
        onChatSelect={setChatId}
        onChatDelete={deleteChatHandler}
        isLoadingDeleteChat={isLoadingDeleteChat}
      />

      <Loading isLoading={isLoadingChats}>
        {hasChat ? (
          <ChatProvider chatId={chatId} runInBackground={true} isNewChat={isNewChat}>
            <ChatImplementation chatId={chatId} />
          </ChatProvider>
        ) : (
          <StartNewChat createChat={addChatHandler} />
        )}
      </Loading>
    </div>
  );
}

function Loading({ isLoading, children }: { isLoading: boolean } & PropsWithChildren) {
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col w-full p-4 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return children;
}

export function ChatImplementation({ chatId }: { chatId: string }) {
  const {
    sendMessage,
    userInput,
    setUserInput,
    combinedEvents,
    progress,
    deleteProgress,
    isLoadingHistory,
    isAgentRunning,
  } = useChatContext();

  // コンテキスト状態（永続化対応）
  const {
    projectList,
    modelList,
    currentProject,
    currentModel,
    recentActivities,
    setProjectList,
    setModelList,
    setCurrentProject,
    setCurrentModel,
    addActivity,
    clearState,
  } = useContextState(chatId);

  // プロジェクト/モデル読み込み状態
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // インサイト状態
  const [insights, setInsights] = useState<InsightItem[]>([]);

  // chatIdが変わったときにインサイトだけリセット（コンテキストはuseContextStateが管理）
  useEffect(() => {
    setInsights([]);
  }, [chatId]);

  // ダークモードトグル
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  // インサイトからコンテキストを更新
  const updateContextFromInsight = useCallback((insight: InsightData) => {
    // プロジェクト一覧からプロジェクトを更新
    if (insight.type === 'project_list' && insight.projects.length > 0) {
      const project = insight.projects[0];
      setCurrentProject({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
      });
    }

    // モデル関連のインサイトからモデル情報を更新
    if ('modelName' in insight && insight.modelName) {
      setCurrentModel({
        id: uuid(),
        name: insight.modelName || '',
        score: 'metrics' in insight ? (insight as { metrics?: Array<{ value?: number }> }).metrics?.[0]?.value : undefined,
        metric: 'metrics' in insight ? (insight as { metrics?: Array<{ name?: string }> }).metrics?.[0]?.name : undefined,
      });
    }

    // アクティビティを追加
    const activityType = insight.type === 'project_list' ? 'project' : 
                        insight.type === 'model_comparison' ? 'model' : 'insight';
    const activityName = 'modelName' in insight ? insight.modelName || insight.type :
                        'projectName' in insight ? insight.projectName || insight.type : 
                        insight.type;
    
    addActivity({
      id: uuid(),
      type: activityType,
      name: activityName || '',
      timestamp: new Date().toLocaleTimeString(),
    });
  }, [setCurrentProject, setCurrentModel, addActivity]);

  // 会話からインサイトとコンテキストを自動抽出
  useEffect(() => {
    if (!combinedEvents) return;

    combinedEvents.forEach((event) => {
      // アシスタントメッセージから情報を抽出
      if (isMessageStateEvent(event) && event.value.role === 'assistant') {
        const content = event.value.content;
        if (content && typeof content === 'object' && 'parts' in content) {
          (content.parts as Array<{ type: string; text?: string; toolInvocation?: { toolName: string; result?: string; args?: Record<string, unknown> } }>).forEach((part) => {
            // テキストパーツからインサイトを抽出
            if (part.type === 'text' && part.text) {
              const insightData = parseInsightFromMessage(part.text);
              if (insightData) {
                // 重複チェック
                const exists = insights.some(
                  (i) => JSON.stringify(i.data) === JSON.stringify(insightData)
                );
                if (!exists) {
                  setInsights((prev) => [
                    ...prev,
                    {
                      id: uuid(),
                      data: insightData,
                      isPinned: false,
                      createdAt: new Date(),
                    },
                  ]);

                  // プロジェクト/モデル情報を自動更新
                  updateContextFromInsight(insightData);
                }
              }
            }

            // ツール呼び出しの結果からコンテキストを抽出
            if (part.type === 'tool-invocation' && part.toolInvocation) {
              const { toolName, result } = part.toolInvocation;
              
              // list_projectsツールの結果からプロジェクト情報を抽出
              if (toolName === 'list_projects' && result) {
                try {
                  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                  // プロジェクトIDと名前のペアを探す（Unicodeエスケープ対応）
                  const projectMatches = resultStr.matchAll(/"([a-f0-9]{24})":\s*"([^"]+)"/g);
                  const projects: Array<ProjectInfo> = [];
                  for (const match of projectMatches) {
                    // Unicodeエスケープをデコード
                    const decodedName = match[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => 
                      String.fromCharCode(parseInt(hex, 16))
                    );
                    const firstName = decodedName.split(' - ')[0]; // 日付部分を除去
                    projects.push({ id: match[1], name: firstName });
                  }
                  if (projects.length > 0) {
                    // プロジェクトリストを保存
                    setProjectList(projects);
                    // 最初のプロジェクトをコンテキストに設定（未選択の場合のみ）
                    if (!currentProject) {
                      setCurrentProject(projects[0]);
                    }
                    // アクティビティに追加
                    addActivity({
                      id: uuid(),
                      type: 'project',
                      name: `${projects.length}件のプロジェクト取得`,
                      timestamp: new Date().toLocaleTimeString(),
                    });
                  }
                } catch {
                  // パース失敗は無視
                }
              }

              // get_feature_impactツールの結果からコンテキストを更新
              if (toolName === 'get_feature_impact' && result) {
                addActivity({
                  id: uuid(),
                  type: 'insight',
                  name: 'Feature Impact取得',
                  timestamp: new Date().toLocaleTimeString(),
                });
              }

              // get_model_accuracyツールの結果からモデル情報を更新
              if (toolName === 'get_model_accuracy' && result) {
                addActivity({
                  id: uuid(),
                  type: 'model',
                  name: 'モデル精度取得',
                  timestamp: new Date().toLocaleTimeString(),
                });
              }

              // get_leaderboardツールの結果からモデル情報を抽出してリストに追加
              if (toolName === 'get_leaderboard' && result) {
                try {
                  // 全モデルを抽出
                  const modelMatches = result.matchAll(/"model_type":\s*"([^"]+)"[^}]*"model_id":\s*"([^"]+)"/g);
                  const models: Array<ModelInfo> = [];
                  for (const match of modelMatches) {
                    const modelName = match[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => 
                      String.fromCharCode(parseInt(hex, 16))
                    );
                    models.push({
                      id: match[2],
                      name: modelName,
                      isRecommended: result.includes('"is_frozen": true'),
                    });
                  }
                  if (models.length > 0) {
                    // モデルリストを保存
                    setModelList(models);
                    // 最初のモデルをコンテキストに設定（未選択の場合のみ）
                    if (!currentModel) {
                      setCurrentModel(models[0]);
                    }
                  }
                } catch {
                  // パース失敗は無視
                }
              }
            }
          });
        }
      }
    });
  }, [combinedEvents, insights, updateContextFromInsight, currentProject, currentModel, addActivity, setProjectList, setModelList, setCurrentProject, setCurrentModel]);

  // インサイトのピン留めトグル
  const handleTogglePin = useCallback((id: string) => {
    setInsights((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isPinned: !i.isPinned } : i))
    );
  }, []);

  // インサイトの削除
  const handleRemoveInsight = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id));
  }, []);

  useAgUiTool({
    name: 'alert',
    description: 'Action. Display an alert to the user',
    handler: ({ message }) => alert(message),
    parameters: z.object({
      message: z.string().describe('The message that will be displayed to the user'),
    }),
    background: false,
  });

  // ヘッダーコンポーネント
  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-[#81FBA5]" />
        <h1 className="text-lg font-semibold text-foreground">
          DataRobot Agent
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleDarkMode}
          className="h-8 w-8 p-0"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // プロジェクト選択ハンドラー
  const handleProjectSelect = useCallback((project: ProjectInfo) => {
    setCurrentProject(project);
    // プロジェクトが変わったらモデルリストをクリア
    setModelList([]);
    setCurrentModel(undefined);
    // アクティビティに追加
    addActivity({
      id: uuid(),
      type: 'project',
      name: `プロジェクト選択: ${project.name}`,
      timestamp: new Date().toLocaleTimeString(),
    });
  }, [setCurrentProject, setModelList, setCurrentModel, addActivity]);

  // モデル選択ハンドラー
  const handleModelSelect = useCallback((model: ModelInfo) => {
    setCurrentModel(model);
    // アクティビティに追加
    addActivity({
      id: uuid(),
      type: 'model',
      name: `モデル選択: ${model.name}`,
      timestamp: new Date().toLocaleTimeString(),
    });
  }, [setCurrentModel, addActivity]);

  return (
    <AnalysisLayout
      header={header}
      contextPanel={
        <ContextPanel
          currentProject={currentProject}
          currentModel={currentModel}
          recentActivities={recentActivities}
          projectList={projectList}
          modelList={modelList}
          isLoadingProjects={isLoadingProjects}
          isLoadingModels={isLoadingModels}
          onProjectSelect={handleProjectSelect}
          onModelSelect={handleModelSelect}
        />
      }
      insightPanel={
        <InsightPanel
          insights={insights}
          onTogglePin={handleTogglePin}
          onRemove={handleRemoveInsight}
        />
      }
    >
      <Chat initialMessages={initialMessages}>
        <ChatMessages isLoading={isLoadingHistory} messages={combinedEvents} chatId={chatId}>
          {combinedEvents &&
            combinedEvents.map((m) => {
              if (isErrorStateEvent(m)) {
                return <ChatError key={m.value.id} {...m.value} />;
              }
              if (isMessageStateEvent(m)) {
                return <ChatMessagesMemo key={m.value.id} {...m.value} />;
              }
              if (isStepStateEvent(m)) {
                return <StepEvent key={m.value.id} {...m.value} />;
              }
              if (isThinkingEvent(m)) {
                return <ThinkingEvent key={m.type} />;
              }
            })}
        </ChatMessages>
        <ChatProgress progress={progress || {}} deleteProgress={deleteProgress} />
        <ChatTextInput
          userInput={userInput}
          setUserInput={setUserInput}
          onSubmit={sendMessage}
          runningAgent={isAgentRunning}
        />
      </Chat>
    </AnalysisLayout>
  );
}
