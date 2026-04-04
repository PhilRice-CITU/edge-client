import { Input } from '@renderer/components/atoms/Input'

interface BatchNameInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function BatchNameInput({ value, onChange, placeholder }: BatchNameInputProps) {
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? 'Operator name'}
      className="h-12 text-base"
    />
  )
}
