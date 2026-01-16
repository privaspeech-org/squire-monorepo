import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-primary/30 bg-primary/20 text-primary shadow-lg shadow-primary/20 hover:bg-primary/30 hover:shadow-primary/30',
        secondary:
          'border-secondary/30 bg-secondary/20 text-secondary shadow-lg shadow-secondary/20 hover:bg-secondary/30 hover:shadow-secondary/30',
        destructive:
          'border-destructive/30 bg-destructive/20 text-destructive shadow-lg shadow-destructive/20 hover:bg-destructive/30 hover:shadow-destructive/30',
        outline: 'text-foreground border-primary/30',
        success:
          'border-accent/30 bg-accent/20 text-accent shadow-lg shadow-accent/20 hover:bg-accent/30 hover:shadow-accent/30',
        warning:
          'border-warning/30 bg-warning/20 text-warning shadow-lg shadow-warning/20 hover:bg-warning/30 hover:shadow-warning/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
