import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'border-primary/60 text-primary',
        warning: 'border-muted-foreground text-muted-foreground',
        rejected: 'border-dashed border-muted-foreground/60 text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
