export type SortMode =
  | 'default'
  | 'name-asc'
  | 'name-desc'
  | 'size-asc'
  | 'size-desc'
  | 'modified-asc'
  | 'modified-desc'
  | 'created-asc'
  | 'created-desc'
export type ActiveModule = 'replace' | 'smart' | 'number' | 'insert' | 'manual' | 'clean'
export type SequenceStyle =
  | 'arabic'
  | 'chinese-lower'
  | 'chinese-upper'
  | 'alpha-lower'
  | 'alpha-upper'
export type NumberRule = {
  prefix: string
  start: number
  style: SequenceStyle
  digits: number
  suffix: string
}
export type ReplaceMode =
  | 'text'
  | 'first'
  | 'last'
  | 'range'
  | 'after'
  | 'before'
  | 'after-n'
  | 'before-n'
export type ReplaceRule = {
  id: string
  mode: ReplaceMode
  find: string
  replacement: string
  start: number
  count: number
  includeExtension: boolean
}
export type InsertInfo = 'created' | 'modified' | 'size' | 'dimensions' | 'captured'
export type InsertRule = {
  kind: 'text' | 'number' | 'info'
  position: 'start' | 'index' | 'end'
  index: number
  text: string
  number: NumberRule
  info: InsertInfo
  prefix: string
  suffix: string
}
export type FileMetadata = { dimensions?: string; capturedAt?: number; error?: string }

export type FileInfo = {
  path: string
  name: string
  size?: number
  createdAt?: number
  modifiedAt?: number
  error?: string
  metadata?: FileMetadata
}

export type FileItem = {
  id: string
  sourcePath: string
  directory: string
  currentName: string
  baseName: string
  extension: string
  size?: number
  createdAt?: number
  modifiedAt?: number
  error?: string
  metadata?: FileMetadata
}

export type PreviewItem = FileItem & {
  targetName: string
  status: 'unchanged' | 'ready' | 'error' | 'success'
  errorMessage?: string
}
