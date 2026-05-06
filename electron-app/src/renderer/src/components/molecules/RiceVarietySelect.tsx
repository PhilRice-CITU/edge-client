import { useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { useVarieties, useCreateVariety, type RiceVariety } from '@renderer/hooks/useVarieties'

interface Props {
  value: RiceVariety | null
  onChange: (v: RiceVariety | null) => void
}

export function RiceVarietySelect({ value, onChange }: Props) {
  const { data: varieties = [], isLoading } = useVarieties()
  const createVariety = useCreateVariety()
  const [open, setOpen] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [form, setForm] = useState({
    name: '',
    grain_class: 'long' as 'long' | 'medium' | 'short',
    avg_length_mm: '',
    avg_width_mm: '',
  })
  const [formError, setFormError] = useState<string | null>(null)

  const handleSelect = (v: RiceVariety) => {
    onChange(v)
    setOpen(false)
    setRegistering(false)
  }

  const handleRegister = async () => {
    setFormError(null)
    if (!form.name.trim()) return setFormError('Name is required')
    const len = parseFloat(form.avg_length_mm)
    const wid = parseFloat(form.avg_width_mm)
    if (isNaN(len) || isNaN(wid) || len <= 0 || wid <= 0)
      return setFormError('Valid dimensions required')
    try {
      const created = await createVariety.mutateAsync({
        name: form.name.trim(),
        grain_class: form.grain_class,
        avg_length_mm: len,
        avg_width_mm: wid,
      })
      onChange(created)
      setOpen(false)
      setRegistering(false)
    } catch {
      setFormError('Failed to register. Try again.')
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-left text-sm text-foreground"
      >
        {value ? `${value.name} (${value.grain_class})` : 'Select rice variety…'}
      </button>

      {open && (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
          {isLoading && (
            <p className="text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {varieties.map((v) => (
            <button
              key={v.id}
              onClick={() => handleSelect(v)}
              className={cn(
                'rounded-lg px-3 py-2 text-left text-sm transition-colors',
                value?.id === v.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-accent',
              )}
            >
              <span className="font-medium">{v.name}</span>
              <span className="ml-2 text-xs opacity-70">
                {v.grain_class} · {v.avg_length_mm}mm
              </span>
            </button>
          ))}

          {!registering ? (
            <button
              onClick={() => setRegistering(true)}
              className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              + Register new variety
            </button>
          ) : (
            <div className="flex flex-col gap-2 border-t border-border pt-2">
              <input
                placeholder="Variety name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                {(['long', 'medium', 'short'] as const).map((gc) => (
                  <button
                    key={gc}
                    onClick={() => setForm((f) => ({ ...f, grain_class: gc }))}
                    className={cn(
                      'flex-1 rounded-lg border py-2 text-xs',
                      form.grain_class === gc
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {gc}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="Avg length (mm)"
                  value={form.avg_length_mm}
                  onChange={(e) => setForm((f) => ({ ...f, avg_length_mm: e.target.value }))}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  inputMode="decimal"
                />
                <input
                  placeholder="Avg width (mm)"
                  value={form.avg_width_mm}
                  onChange={(e) => setForm((f) => ({ ...f, avg_width_mm: e.target.value }))}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  inputMode="decimal"
                />
              </div>
              {formError && <p className="text-xs text-destructive">{formError}</p>}
              <button
                onClick={handleRegister}
                disabled={createVariety.isPending}
                className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {createVariety.isPending ? 'Saving…' : 'Save & Select'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
