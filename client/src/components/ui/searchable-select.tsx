import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  optionLabels?: Record<string, string>;
  placeholder?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  optionLabels,
  placeholder = '选择...',
  triggerClassName,
  contentClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = React.useMemo(() => {
    if (!normalizedSearch) return options;
    return options.filter((option) => {
      const optionText = (optionLabels?.[option] ?? option).toLowerCase();
      return optionText.includes(normalizedSearch) || option.toLowerCase().includes(normalizedSearch);
    });
  }, [options, optionLabels, normalizedSearch]);

  const displayValue = (value && optionLabels?.[value]) || value || placeholder;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex items-center justify-between gap-1 overflow-hidden rounded-full border border-input bg-transparent px-2 text-xs font-normal hover:bg-accent',
            triggerClassName,
          )}
        >
          <span className={cn('flex-1 truncate text-center', !value && 'text-muted-foreground')}>
            {displayValue}
          </span>
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-[200px] p-0 rounded-lg', contentClassName)}
        align="start"
      >
        <Command>
          <div className="flex h-8 items-center gap-2 border-b px-2">
            <Search className="size-3 shrink-0 text-muted-foreground" />
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="搜索..."
              className="h-8 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="max-h-[240px] overflow-y-auto p-1">
            <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
              暂无匹配选项
            </CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={(selectedValue) => {
                    onValueChange(selectedValue);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex items-center justify-between rounded-sm px-2 py-1.5 text-xs"
                >
                  <span className="truncate">{optionLabels?.[option] ?? option}</span>
                  {option === value && <Check className="size-3 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
