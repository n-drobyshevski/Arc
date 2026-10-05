// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (ArcKey, KeyStyle, KeySize)
//
// A physical key: a pale (or orange, or navy) face over a 2px edge strip that
// the face travels down onto while pressed (60 ms, KeyEasing). The label is
// uppercase capsKey, at most two lines, after the pocket operator app. Quiet
// keys are flat graphite text with no travel. A disabled key fades to .45,
// edge and all.
import type { ButtonHTMLAttributes, CSSProperties, ComponentChildren, JSX } from 'preact'
import './Key.css'

/** enum class KeyStyle. */
export type KeyStyle = 'normal' | 'signal' | 'quiet' | 'navy'
/** enum class KeySize: Normal 48/15/18 capsKey, Small 40/10/14 capsKeySmall, Wide 60/15/18 capsKeyWide. */
export type KeySize = 'normal' | 'small' | 'wide'

export interface KeyProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'size' | 'children'> {
  /** The label, as written; the key uppercases it. */
  text: string
  onClick?: () => void
  /** KeyStyle (default 'normal'). */
  variant?: KeyStyle
  /** KeySize (default 'normal'). */
  size?: KeySize
  disabled?: boolean
  /** Overrides the label colour (Kotlin `textColor`, e.g. var(--danger)). */
  textColor?: string
  /** Stretch to the parent's width (Modifier.fillMaxWidth). */
  block?: boolean
  class?: string
  style?: CSSProperties
  /** Extra content after the label (rare; most keys are text only). */
  children?: ComponentChildren
}

export function Key(props: KeyProps): JSX.Element {
  const {
    text, onClick, variant = 'normal', size = 'normal', disabled = false, textColor, block = false,
    class: cls, style, children, type = 'button', ...rest
  } = props
  const classes = ['key', `key--${variant}`, `key--${size}`]
  if (block) classes.push('key--block')
  if (cls) classes.push(cls)
  const merged: CSSProperties | undefined = textColor ? { ...style, color: textColor } : style
  return (
    <button
      {...rest}
      type={type}
      class={classes.join(' ')}
      disabled={disabled}
      style={merged}
      onClick={onClick ? () => onClick() : undefined}
    >
      <span class="key__label">{text}</span>
      {children}
    </button>
  )
}
