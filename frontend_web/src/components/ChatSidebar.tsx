import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Settings,
  LoaderCircle,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialogModal } from '@/components/ConfirmDialog.tsx';
import type { ChatListItem } from '@/api/chat/types';
import { useNavigate } from 'react-router-dom';
import { JSX, useState } from 'react';

export interface ChatSidebarProps {
  isLoading: boolean;
  chatId: string;
  onChatCreate: () => any;
  onChatSelect: (threadId: string) => any;
  onChatDelete: (threadId: string, callbackFn: () => void) => any;
  chats?: ChatListItem[];
  isLoadingDeleteChat: boolean;
}

export function ChatSidebar({
  isLoading,
  chats,
  chatId,
  onChatSelect,
  onChatCreate,
  onChatDelete,
  isLoadingDeleteChat,
}: ChatSidebarProps) {
  const navigate = useNavigate();
  const goToSettings = () => navigate('/settings');
  const [chatToDelete, setChatToDelete] = useState<ChatListItem | null>(null);
  const getIcon = (id: string): JSX.Element => {
    if (id === chatToDelete?.id && isLoadingDeleteChat) {
      return <LoaderCircle className="animate-spin" />;
    }
    if (id === chatId) {
      return <MessageSquareText />;
    }
    return <MessageSquare />;
  };
  const [open, setOpen] = useState<boolean>(false);

  return (
    <Sidebar className="sidebar bg-gray-900 border-r border-gray-800">
      <SidebarContent className="bg-gray-900">
        {/* ヘッダー */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-[#81FBA5]" />
            <span className="font-semibold text-white">DataRobot Agent</span>
          </div>
        </div>

        <SidebarGroup className="px-2 py-3">
          {/* 新規チャットボタン */}
          <SidebarMenuItem key="new-chat" className="mb-2">
            <SidebarMenuButton
              disabled={isLoading}
              asChild
              onClick={onChatCreate}
              testId="start-new-chat-btn"
              className="bg-[#81FBA5]/10 hover:bg-[#81FBA5]/20 border border-[#81FBA5]/30 rounded-lg text-[#81FBA5] font-medium"
            >
              <div className="flex items-center gap-2 py-1">
                <Plus className="h-4 w-4" />
                <span>新規チャット</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarGroupLabel className="text-xs text-gray-500 uppercase tracking-wider px-2 mb-2">履歴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu id="sidebar-chats" className="space-y-1">
              {isLoading ? (
                <>
                  <Skeleton className="h-10 bg-gray-800" />
                  <Skeleton className="h-10 bg-gray-800" />
                  <Skeleton className="h-10 bg-gray-800" />
                </>
              ) : (
                !!chats &&
                chats.map((chat: ChatListItem) => (
                  <SidebarMenuItem key={chat.id} testId={`chat-${chat.id}`}>
                    <SidebarMenuButton
                      asChild
                      isActive={chat.id === chatId}
                      onClick={() => onChatSelect(chat.id)}
                      className={cn(
                        "rounded-lg transition-colors",
                        chat.id === chatId
                          ? "bg-gray-800 text-white border-l-2 border-[#81FBA5]"
                          : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2 py-1 px-1">
                        {getIcon(chat.id)}
                        <span className="truncate text-sm">{chat.name || '新規チャット'}</span>
                      </div>
                    </SidebarMenuButton>
                    {chat.initialised && !chatToDelete && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction className="text-gray-500 hover:text-white">
                            <MoreHorizontal className="h-4 w-4" />
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" className="bg-gray-800 border-gray-700">
                          <DropdownMenuItem
                            testId="delete-chat-menu-item"
                            onClick={() => {
                              setChatToDelete(chat);
                              setOpen(true);
                            }}
                            className="text-red-400 hover:text-red-300 hover:bg-gray-700"
                          >
                            <span>削除</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 設定 */}
        <div className="mt-auto border-t border-gray-800 p-2">
          <SidebarMenuItem key="open-settings">
            <SidebarMenuButton
              disabled={isLoading}
              asChild
              onClick={goToSettings}
              className="text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
            >
              <div className="flex items-center gap-2 py-1 px-2">
                <Settings className="h-4 w-4" />
                <span>設定</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </div>
      </SidebarContent>
      <ConfirmDialogModal
        open={open}
        setOpen={setOpen}
        onSuccess={() => onChatDelete(chatToDelete!.id, () => setChatToDelete(null))}
        onDiscard={() => setChatToDelete(null)}
        chatName={chatToDelete?.name || ''}
      />
    </Sidebar>
  );
}
