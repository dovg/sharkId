import { useEffect, useState } from 'react'

const SITE = 'sharkId.tech'

export function usePageTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${SITE} → ${page}` : SITE
    return () => { document.title = SITE }
  }, [page])
}

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    const pref = localStorage.getItem('sharkid-theme')
    if (pref === 'dark') return true
    if (pref === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  const toggle = () => {
    setDark(d => {
      const next = !d
      localStorage.setItem('sharkid-theme', next ? 'dark' : 'light')
      return next
    })
  }

  return { dark, toggle }
}
