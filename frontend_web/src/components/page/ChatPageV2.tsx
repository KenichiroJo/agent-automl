/**
 * ChatPageV2 - チャット統合型レイアウト
 *
 * 左: チャット履歴サイドバー
 * 右: メインチャットエリア（ヘッダー + クイックアクション + 会話）
 *
 * CONTEXTとINSIGHTSはチャット内にインライン表示
 */
import { PropsWithChildren, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import z from 'zod/v4';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ChatLayout } from '@/components/layout/ChatLayout';
import { ContextBar } from '@/components/ContextBar';
import { QuickActions } from '@/components/QuickActions';
import { type ProjectInfo, type ModelInfo } from '@/components/layout';

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

下のクイックアクションボタン、または直接質問を入力してください。`,
        },
      ],
    },
    createdAt: new Date(),
    type: 'initial',
  },
];

export function ChatPageV2({
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

  // サイドバーコンポーネント
  const sidebar = (
    <ChatSidebar
      isLoading={isLoadingChats}
      chatId={chatId}
      chats={chats}
      onChatCreate={addChatHandler}
      onChatSelect={setChatId}
      onChatDelete={deleteChatHandler}
      isLoadingDeleteChat={isLoadingDeleteChat}
    />
  );

  return (
    <ChatLayout sidebar={sidebar}>
      <Loading isLoading={isLoadingChats}>
        {hasChat ? (
          <ChatProvider chatId={chatId} runInBackground={true} isNewChat={isNewChat}>
            <ChatImplementation chatId={chatId} />
          </ChatProvider>
        ) : (
          <StartNewChat createChat={addChatHandler} />
        )}
      </Loading>
    </ChatLayout>
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

  // ダークモードトグル
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  // クイックアクション実行
  const handleQuickAction = useCallback((prompt: string) => {
    setUserInput(prompt);
    // 少し遅延させてから送信（UXのため）
    setTimeout(() => {
      sendMessage(prompt);
    }, 100);
  }, [sendMessage, setUserInput]);

  // コンテキストクリア
  const handleClearProject = useCallback(() => {
    setCurrentProject(undefined);
    setModelList([]);
    setCurrentModel(undefined);
    addActivity({
      id: uuid(),
      type: 'project',
      name: 'プロジェクトをクリア',
      timestamp: new Date().toLocaleTimeString(),
    });
  }, [setCurrentProject, setModelList, setCurrentModel, addActivity]);

  const handleClearModel = useCallback(() => {
    setCurrentModel(undefined);
    addActivity({
      id: uuid(),
      type: 'model',
      name: 'モデルをクリア',
      timestamp: new Date().toLocaleTimeString(),
    });
  }, [setCurrentModel, addActivity]);

  // 処理済みイベントIDを追跡（無限ループ防止）
  const processedEventsRef = useRef<Set<string>>(new Set());

  // 会話からコンテキストを自動抽出
  useEffect(() => {
    if (!combinedEvents || combinedEvents.length === 0) return;

    combinedEvents.forEach((event) => {
      // イベントIDがない場合は処理しない
      const eventId = 'id' in event ? String(event.id) : undefined;
      if (!eventId || processedEventsRef.current.has(eventId)) return;
      
      // ユーザーメッセージからプロジェクト/モデルIDを検出
      if (isMessageStateEvent(event) && event.value.role === 'user') {
        const content = event.value.content;
        if (content && typeof content === 'string') {
          // プロジェクトIDの検出（24文字の16進数）
          const projectIdMatch = content.match(/\b([a-f0-9]{24})\b/i);
          if (projectIdMatch) {
            const detectedId = projectIdMatch[1];
            processedEventsRef.current.add(eventId);
            setCurrentProject({ id: detectedId, name: `Project ${detectedId.slice(0, 8)}...` });
            setModelList([]);
            setCurrentModel(undefined);
          }
        }
      }

      // アシスタントメッセージから情報を抽出
      if (isMessageStateEvent(event) && event.value.role === 'assistant') {
        const content = event.value.content;
        if (content && typeof content === 'object' && 'parts' in content) {
          let hasExtractedData = false;
          
          (content.parts as Array<{ type: string; text?: string; toolInvocation?: { toolName: string; result?: string; args?: Record<string, unknown> } }>).forEach((part) => {
            // テキストパーツからテーブル形式の情報を抽出
            if (part.type === 'text' && part.text) {
              const textContent = part.text;

              // テーブル形式のプロジェクト一覧を抽出
              const projectTablePattern = /\|\s*([a-f0-9]{24})\s*\|\s*([^|]+?)\s*\|/gi;
              const projectTableMatches = Array.from(textContent.matchAll(projectTablePattern));

              if (projectTableMatches.length > 0) {
                const extractedProjects: Array<ProjectInfo> = projectTableMatches.slice(0, 20).map((match) => {
                  const fullName = match[2].trim();
                  const shortName = fullName.split(' - ')[0];
                  return { id: match[1], name: shortName };
                });

                const uniqueProjects = extractedProjects.filter(
                  (project, index, self) => index === self.findIndex((p) => p.id === project.id)
                );

                if (uniqueProjects.length > 0) {
                  hasExtractedData = true;
                  setProjectList(uniqueProjects);
                  addActivity({
                    id: uuid(),
                    type: 'project',
                    name: `${uniqueProjects.length}件のプロジェクト取得`,
                    timestamp: new Date().toLocaleTimeString(),
                  });
                }
              }

              // テーブル形式のモデル一覧を抽出
              const modelTablePattern = /\|\s*(Light Gradient|RuleFit|Generalized|ElasticNet|Random Forest|XGBoost|Keras|AVG Blender|ENET Blender)[^|]*\|[^|]*\|[^|]*\|\s*([a-f0-9]{20,})\s*\|/gi;
              const tableMatches = Array.from(textContent.matchAll(modelTablePattern));

              if (tableMatches.length > 0) {
                const extractedModels: Array<ModelInfo> = tableMatches.map((match) => ({
                  id: match[2],
                  name: match[1].trim(),
                }));

                const uniqueModels = extractedModels.filter(
                  (model, index, self) => index === self.findIndex((m) => m.id === model.id)
                );

                if (uniqueModels.length > 0) {
                  hasExtractedData = true;
                  setModelList(uniqueModels);
                  setCurrentModel(uniqueModels[0]);
                  addActivity({
                    id: uuid(),
                    type: 'model',
                    name: `${uniqueModels.length}件のモデル取得`,
                    timestamp: new Date().toLocaleTimeString(),
                  });
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
                  const projectMatches = resultStr.matchAll(/"([a-f0-9]{24})":\s*"([^"]+)"/g);
                  const projects: Array<ProjectInfo> = [];
                  for (const match of projectMatches) {
                    if (projects.length >= 20) break; // 最大20件まで
                    const decodedName = match[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
                      String.fromCharCode(parseInt(hex, 16))
                    );
                    const firstName = decodedName.split(' - ')[0];
                    projects.push({ id: match[1], name: firstName });
                  }
                  if (projects.length > 0) {
                    hasExtractedData = true;
                    setProjectList(projects);
                    setCurrentProject(projects[0]);
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

              // list_modelsツールの結果からモデル情報を抽出
              if (toolName === 'list_models' && result) {
                try {
                  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                  const modelIdMatches = resultStr.matchAll(/([a-f0-9]{24}[a-f0-9]+)\b/g);
                  const modelTypeMatches = resultStr.matchAll(/Light Gradient Boosted Trees|RuleFit|Generalized Additive|ElasticNet|Random Forest|XGBoost|Keras|AVG Blender|ENET Blender/gi);

                  const modelIds = Array.from(modelIdMatches).map((m) => m[1]);
                  const modelTypes = Array.from(modelTypeMatches).map((m) => m[0]);

                  const models: Array<ModelInfo> = [];
                  for (let i = 0; i < Math.min(modelIds.length, modelTypes.length); i++) {
                    models.push({ id: modelIds[i], name: modelTypes[i] });
                  }

                  if (models.length > 0) {
                    hasExtractedData = true;
                    setModelList(models);
                    setCurrentModel(models[0]);
                    addActivity({
                      id: uuid(),
                      type: 'model',
                      name: `${models.length}件のモデル取得`,
                      timestamp: new Date().toLocaleTimeString(),
                    });
                  }
                } catch {
                  // パース失敗は無視
                }
              }
            }
          });

          // 処理済みとしてマーク（データ抽出があった場合のみ）
          if (hasExtractedData) {
            processedEventsRef.current.add(eventId);
          }
        }
      }
    });
  }, [combinedEvents, addActivity, setProjectList, setModelList, setCurrentProject, setCurrentModel]);

  useAgUiTool({
    name: 'alert',
    description: 'Action. Display an alert to the user',
    handler: ({ message }) => alert(message),
    parameters: z.object({
      message: z.string().describe('The message that will be displayed to the user'),
    }),
    background: false,
  });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-background">
      {/* コンテキストバー（ヘッダー） */}
      <ContextBar
        project={currentProject}
        model={currentModel}
        onClearProject={handleClearProject}
        onClearModel={handleClearModel}
        isDark={isDark}
        onToggleDark={toggleDarkMode}
      />

      {/* クイックアクションバー */}
      <QuickActions
        hasProject={!!currentProject}
        hasModel={!!currentModel}
        onAction={handleQuickAction}
        isRunning={isAgentRunning}
      />

      {/* チャットエリア */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
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
      </div>
    </div>
  );
}

// エクスポート（既存のChatPageの代わりに使用）
export { ChatPageV2 as ChatPage };
