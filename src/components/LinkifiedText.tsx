import { Fragment } from 'react'

interface LinkifiedTextProps {
  text: string
}

const URL_REGEX = /(https?:\/\/\S+)/g

const LINK_STYLE = {
  color: '#2563eb',
  textDecoration: 'underline',
  cursor: 'pointer',
} as const

export function LinkifiedText({ text }: LinkifiedTextProps) {
  const lines = text.split('\n')

  return (
    <>
      {lines.map((line, lineIndex) => {
        const parts = line.split(URL_REGEX)

        return (
          <Fragment key={`${line}-${lineIndex}`}>
            {parts.map((part, partIndex) =>
              /^https?:\/\//.test(part) ? (
                <a
                  key={`${part}-${partIndex}`}
                  href={part}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={LINK_STYLE}
                >
                  {part}
                </a>
              ) : (
                <Fragment key={`${part}-${partIndex}`}>{part}</Fragment>
              ),
            )}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </Fragment>
        )
      })}
    </>
  )
}
