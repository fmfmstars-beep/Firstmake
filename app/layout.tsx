import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { M_PLUS_Rounded_1c } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT

const rounded = M_PLUS_Rounded_1c({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-rounded',
})

export const metadata: Metadata = {
  title: 'ほっとカフェ掲示板 | お悩み相談',
  description:
    '匿名でそっと相談できる、お悩み相談の掲示板。恋愛・仕事・くらしのモヤモヤを気軽に打ち明けて、あたたかい言葉をもらえる場所です。',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffb4a2',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className={`${rounded.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
        {ADSENSE_CLIENT && (
          <Script
            id="adsbygoogle-init"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        )}
      </body>
    </html>
  )
}
