import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium transition-all active:scale-[0.98] focus-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /* macOS 默认按钮：强调色填充 + 顶部微光 + 细腻描边 */
        default:
          'bg-accent text-accent-foreground shadow-sm ring-1 ring-inset ring-black/10 hover:bg-accent/90 hover:shadow',
        ghost: 'hover:bg-foreground/[0.06] text-foreground/75 hover:text-foreground',
        /* macOS 工具栏次要按钮：浅色底 + 发丝线描边 */
        outline:
          'border border-border bg-card/60 text-foreground/80 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] hover:bg-card hover:text-foreground hover:border-foreground/20',
        secondary: 'bg-foreground/[0.06] text-foreground/85 hover:bg-foreground/[0.09]',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-xl px-6',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7 rounded-md',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants };
