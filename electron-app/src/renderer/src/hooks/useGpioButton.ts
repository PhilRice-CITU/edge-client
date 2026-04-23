import { useEffect, useRef } from 'react'

export function useGpioButton(
  mode: 'training' | 'session',
  onPress: () => void,
): void {
  const onPressRef = useRef(onPress)
  onPressRef.current = onPress

  useEffect(() => {
    window.api.setGpioMode(mode)

    const removeListener = window.api.onGpioButtonPressed(() => {
      onPressRef.current()
    })

    return () => {
      window.api.setGpioMode('idle')
      removeListener()
    }
  }, [mode])
}
