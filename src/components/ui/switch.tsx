import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      /* macOS 开关比例：38×22，拇指 18，行程 16px */
      'peer inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-black/[0.04] transition-colors duration-200 focus-ring disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-accent data-[state=checked]:shadow-[inset_0_1px_2px_hsl(var(--foreground)/0.12)]',
      'data-[state=unchecked]:bg-foreground/[0.16] data-[state=unchecked]:shadow-[inset_0_1px_2px_hsl(var(--foreground)/0.08)]',
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_hsl(var(--foreground)/0.35),0_0_0_0.5px_hsl(var(--foreground)/0.1)] ring-0 transition-transform duration-200',
        'data-[state=checked]:translate-x-[16px] data-[state=unchecked]:translate-x-0',
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
