import { Separator } from 'react-resizable-panels'

/**
 * Wide resize hit target with a 1px visual rule.
 *
 * The real separator is deliberately wider than the line it draws: a 1px
 * drag target next to a scrolling sidebar feels indistinguishable from the
 * scrollbar gutter.
 */
export function ResizableSeparator() {
  return (
    <Separator className="group relative z-10 w-2.5 shrink-0 cursor-col-resize touch-none select-none bg-transparent">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80 transition-colors group-hover:bg-accent/50 group-active:bg-accent/70"
      />
    </Separator>
  )
}
