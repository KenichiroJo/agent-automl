import type { Message } from '@ag-ui/core';
import { ContentPart, ToolInvocation } from '@/types/message.ts';

// TODO: This awkwardly shoves AGUI message list into the Mastra format.
// I didn't want to completely rewrite the UI, still figuring out where to go here.

export interface ChatListItem {
  id: string;
  userId: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date | null;
  metadata?: Record<string, unknown>;
}

type JSONValue =
  | null
  | string
  | number
  | boolean
  | {
      [value: string]: JSONValue;
    }
  | Array<JSONValue>;

export type MessageResponse = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  createdAt: Date;
  threadId?: string;
  resourceId?: string;
  type?: string;
  format: 2;
  parts: ContentPart[];
  content?: string;
  toolInvocations?: ToolInvocation[];
  reasoning?: string;
  annotations?: JSONValue[] | undefined;
  metadata?: Record<string, unknown>;
};

export type MessagePage = {
  messages: MessageResponse[];
};

export type APIChat = {
  name: string;
  thread_id: string;
  user_id: string;
  created_at: string;
  update_time: string;
  metadata?: Record<string, unknown>;
};

export type APIChatWithMessages = APIChat & {
  messages: Message[];
};
