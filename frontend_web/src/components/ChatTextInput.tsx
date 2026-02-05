import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { KeyboardEvent, useRef, useState } from 'react';

export interface ChatTextInputProps {
  onSubmit: (text: string) => any;
  userInput: string;
  setUserInput: (value: string) => void;
  runningAgent: boolean;
}

export function ChatTextInput({
  onSubmit,
  userInput,
  setUserInput,
  runningAgent,
}: ChatTextInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  function keyDownHandler(e: KeyboardEvent) {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !isComposing &&
      !runningAgent &&
      userInput.trim().length
    ) {
      if (e.ctrlKey || e.metaKey) {
        const el = ref.current;
        e.preventDefault();
        if (el) {
          const start = el.selectionStart;
          const end = el.selectionEnd;

          const newValue = userInput.slice(0, start) + '\n' + userInput.slice(end);
          setUserInput(newValue);
        }
      } else {
        e.preventDefault();
        onSubmit(userInput);
      }
    }
  }

  return (
    <div className="chat-text-input relative bg-gradient-to-t from-background via-background to-transparent pt-4">
      <div className="relative bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl shadow-lg">
        <Textarea
          ref={ref}
          value={userInput}
          onChange={e => setUserInput(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={keyDownHandler}
          placeholder="メッセージを入力..."
          className="pr-14 text-area border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 resize-none min-h-[3rem] max-h-[12rem]"
        ></Textarea>
        {runningAgent ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="absolute bottom-3 right-3">
                <Button testId="send-message-disabled-btn" type="submit" size="icon" disabled className="rounded-lg bg-muted">
                  <Loader2 className="animate-spin text-[#81FBA5]" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>エージェント実行中</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            type="submit"
            onClick={() => onSubmit(userInput)}
            className="absolute bottom-3 right-3 rounded-lg bg-[#81FBA5] hover:bg-[#81FBA5]/80 text-gray-900 shadow-md transition-all hover:shadow-lg"
            size="icon"
            testId="send-message-btn"
            disabled={!userInput.trim().length}
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-2">
        Enter で送信 • Shift+Enter で改行
      </p>
    </div>
  );
}
