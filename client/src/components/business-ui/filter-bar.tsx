import React from 'react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

const FilterBar: React.FC<FilterBarProps> = ({ children, className }) => {
  return (
    <div className={cn('bg-card border border-border rounded-sm p-3', className)}>
      {children}
    </div>
  );
};

export default FilterBar;
