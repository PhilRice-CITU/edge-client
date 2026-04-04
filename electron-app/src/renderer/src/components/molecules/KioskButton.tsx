import type { ComponentProps } from 'react'
import { Button } from '@renderer/components/atoms/Button'
import { cn } from '@renderer/lib/utils'

interface KioskButtonProps extends Omit<ComponentProps<'button'>, 'ref'> {
  variant?: 'primary' | 'secondary' | 'danger'
}

export function KioskButton({ className, variant = 'primary', ...props }: KioskButtonProps) {
  const buttonVariant =
    variant === 'primary' ? 'default' : variant === 'danger' ? 'destructive' : 'secondary'

  return (
    <Button
      variant={buttonVariant}
      size="kiosk"
      className={cn('w-full', className)}
      {...props}
    />
  )
}
