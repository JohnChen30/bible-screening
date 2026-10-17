import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * 全屏宿主元素 id：控制台根容器（全屏时即全屏元素）以此 id 标记。
 * Popover 内容默认 portal 进该元素——否则会落到 document.body（全屏元素之外），
 * 全屏时整段被浏览器隐藏，导致「排版设置」在全屏下打不开。
 * 无该元素时（如投影窗 /output）回退到 body，行为不变。
 */
function getPopoverContainer(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.getElementById('app-root-fs') ?? undefined;
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { container?: HTMLElement }
>(({ className, align = 'center', sideOffset = 8, container, ...props }, ref) => (
  <PopoverPrimitive.Portal container={container ?? getPopoverContainer()}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'glass z-50 w-72 rounded-xl border border-border p-4 text-foreground shadow-2xl outline-none data-[state=open]:animate-zoom-in',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
