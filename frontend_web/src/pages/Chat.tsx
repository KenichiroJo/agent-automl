import React, { useState } from 'react';
// 案1: チャット統合型レイアウトを使用
import { ChatPage as ChatPageImplementation } from '@/components/page/ChatPageV2.tsx';

export const ChatPage: React.FC = () => {
  const [chatId, setChatId] = useState<string>(() => window.location.hash?.substring(1));

  const setChatIdHandler = (id: string) => {
    setChatId(id);
    window.location.hash = id;
  };

  return <ChatPageImplementation chatId={chatId} setChatId={setChatIdHandler} />;
};
