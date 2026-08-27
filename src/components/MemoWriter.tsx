import { forwardRef } from 'react'
import { Writer as WriterBase, type WriterHandle } from './Writer'

export const MemoWriter = forwardRef<WriterHandle, React.ComponentProps<typeof WriterBase>>(function MemoWriter(
  props,
  ref,
) {
  return <WriterBase ref={ref} {...props} />
})
