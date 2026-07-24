'use client';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface UndoRedoToolbarButtonProps {
  action: 'undo' | 'redo';
}

export function UndoRedoToolbarButton({ action }: UndoRedoToolbarButtonProps) {
  const { editor } = useTiptapEditor();

  if (!editor) return null;

  const canExecute =
    action === 'undo' ? editor.can().undo() : editor.can().redo();
  const Icon = action === 'undo' ? '↩️' : '↪️';

  return (
    <TooltipProvider>
      <Tooltip delayDuration={700}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              action === 'undo'
                ? editor.chain().focus().undo().run()
                : editor.chain().focus().redo().run()
            }
            disabled={!canExecute}
            className="size-6 px-0"
          >
            <span className="inline-flex items-center justify-center text-base leading-none">{Icon}</span>
            <span className="sr-only">
              {action === 'undo' ? '撤销' : '重做'}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{action === 'undo' ? '撤销(⌘+Z)' : '重做(⌘+Shift+Z)'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
