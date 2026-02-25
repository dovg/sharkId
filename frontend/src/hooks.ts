import { useEffect } from 'react'

const SITE = 'sharkId.tech'

export function usePageTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${SITE} → ${page}` : SITE
    return () => { document.title = SITE }
  }, [page])
}
