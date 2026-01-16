import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-30 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 uppercase tracking-wider',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border border-primary shadow-lg shadow-primary/50 hover:shadow-primary/70 hover:brightness-110 active:scale-95',
        destructive:
          'bg-destructive text-destructive-foreground border border-destructive shadow-lg shadow-destructive/50 hover:shadow-destructive/70 hover:brightness-110 active:scale-95',
        outline:
          'border-2 border-primary/30 bg-transparent text-foreground shadow-sm hover:bg-primary/10 hover:border-primary hover:shadow-primary/30 active:scale-95',
        secondary:
          'bg-secondary text-secondary-foreground border border-secondary shadow-lg shadow-secondary/50 hover:shadow-secondary/70 hover:brightness-110 active:scale-95',
        ghost: 'hover:bg-primary/10 hover:text-primary active:scale-95',
        link: 'text-primary underline-offset-4 hover:underline hover:text-secondary',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 rounded-sm px-3 text-xs',
        lg: 'h-12 rounded-sm px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
