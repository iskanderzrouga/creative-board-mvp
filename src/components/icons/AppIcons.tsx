import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & {
  title?: string
}

function SvgIcon({ title, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : 'presentation'}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function BoardIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 8.5h9" />
      <path d="M7.5 12h7" />
      <path d="M7.5 15.5h5" />
    </SvgIcon>
  )
}

export function AnalyticsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 19.5h16" />
      <path d="M7.5 16.5v-4" />
      <path d="M12 16.5V7.5" />
      <path d="M16.5 16.5v-6.5" />
    </SvgIcon>
  )
}

export function WorkloadIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="8" cy="9" r="2.5" />
      <circle cx="16" cy="8" r="2.5" />
      <path d="M4.5 18c.7-2.5 2.5-3.8 5-3.8s4.3 1.3 5 3.8" />
      <path d="M13.5 18c.5-1.8 1.8-2.8 3.7-2.8 1.2 0 2.2.3 3 .9" />
    </SvgIcon>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.2" />
      <path d="M12 18.3v2.2" />
      <path d="M20.5 12h-2.2" />
      <path d="M5.7 12H3.5" />
      <path d="M18 6l-1.6 1.6" />
      <path d="M7.6 16.4L6 18" />
      <path d="M18 18l-1.6-1.6" />
      <path d="M7.6 7.6L6 6" />
    </SvgIcon>
  )
}

export function BlockedIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.7 15.3 15.3 8.7" />
    </SvgIcon>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.4l2.8 1.6" />
    </SvgIcon>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="5.5" />
      <path d="m16 16 3.5 3.5" />
    </SvgIcon>
  )
}

export function XIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </SvgIcon>
  )
}
