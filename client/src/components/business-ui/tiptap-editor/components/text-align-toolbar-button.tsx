'use client';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ALIGN_OPTIONS = [
  { value: 'left', label: '左对齐', icon: '⬅️' },
  { value: 'center', label: '居中对齐', icon: '↔️' },
  { value: 'right', label: '右对齐', icon: '➡️' },
] as const;

export function TextAlignToolbarButton() {
  const { editor } = useTiptapEditor();

  if (!editor) return null;

  const getCurrentAlignment = () => {
    if (editor.isActive({ textAlign: 'center' })) return 'center';
    if (editor.isActive({ textAlign: 'right' })) return 'right';
    return 'left';
  };

  const isDefaultLeft =
    !editor.isActive({ textAlign: 'center' }) &&
    !editor.isActive({ textAlign: 'right' }) &&
    !editor.isActive({ textAlign: 'justify' });

  const alignment = getCurrentAlignment();
  const currentOption = ALIGN_OPTIONS.find((opt) => opt.value === alignment);
  const Icon = currentOption?.icon ?? '⬅️';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-0.5 px-2">
          <span className="inline-flex items-center justify-center text-base leading-none">{Icon}</span>
          <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground" >▼</span>
          <span className="sr-only">文字对齐</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-50">
        {ALIGN_OPTIONS.map((option) => {
          const OptionIcon = option.icon;
          const active =
            option.value === 'left'
              ? editor.isActive({ textAlign: 'left' }) || isDefaultLeft
              : editor.isActive({ textAlign: option.value });

          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() =>
                editor.chain().focus().setTextAlign(option.value).run()
              }
              disabled={!editor.can().setTextAlign(option.value)}
              className={cn('justify-between', active && 'bg-accent')}
            >
              <span className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center text-base leading-none">{OptionIcon}</span>
                {option.label}
              </span>
              {active && <span className="inline-flex items-center justify-center text-base leading-none" >✓</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
