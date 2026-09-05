'use client'

import { useToast } from '@/hooks/use-toast'
import { useTranslations } from 'next-intl'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

export function Toaster() {
  const t = useTranslations('common')
  const { toasts } = useToast()

  return (
    <ToastProvider label={t('notification')}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose aria-label={t('close')} />
          </Toast>
        )
      })}
      <ToastViewport label={t('notificationsHotkey')} />
    </ToastProvider>
  )
}
